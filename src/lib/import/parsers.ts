/**
 * File parsers for CSV, Excel (XLSX), and PDF
 * Extracts raw rows/text from uploaded files for template matching or AI extraction
 */

import * as XLSX from 'xlsx';

export interface ParsedRow {
    [key: string]: string;
}

export interface ParseResult {
    headers: string[];
    rows: ParsedRow[];
    rawText: string;
    rowCount: number;
}

/**
 * Parse CSV text into headers + rows
 */
export function parseCSV(text: string): ParseResult {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [], rawText: text, rowCount: 0 };

    // Smart delimiter detection
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = tabCount > commaCount ? '\t' : semicolonCount > commaCount ? ';' : ',';

    const splitLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    };

    const headers = splitLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length && rows.length < 2000; i++) {
        const cols = splitLine(lines[i]);
        if (cols.length === 0 || (cols.length === 1 && cols[0] === '')) continue;
        const row: ParsedRow = {};
        headers.forEach((h, idx) => {
            row[h] = (cols[idx] || '').replace(/^["']|["']$/g, '');
        });
        rows.push(row);
    }

    return { headers, rows, rawText: text, rowCount: rows.length };
}

/**
 * Parse XLSX buffer into headers + rows
 */
export function parseExcel(buffer: Buffer): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [], rawText: '', rowCount: 0 };

    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (jsonData.length === 0) return { headers: [], rows: [], rawText: '', rowCount: 0 };

    const headers = Object.keys(jsonData[0]);
    const rows: ParsedRow[] = jsonData.slice(0, 2000).map((row) => {
        const parsed: ParsedRow = {};
        headers.forEach((h) => {
            parsed[h] = String(row[h] ?? '');
        });
        return parsed;
    });

    const rawText = rows.map((r) => Object.values(r).join(' | ')).join('\n');
    return { headers, rows, rawText, rowCount: rows.length };
}

/**
 * Parse PDF buffer into raw text
 * Returns text only — rows/headers must be extracted by template or AI
 */
export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
    // Polyfill for Node.js 21+ PDF.js issue where DOMMatrix is missing in serverless environments
    if (typeof global !== 'undefined' && typeof (global as any).DOMMatrix === 'undefined') {
        (global as any).DOMMatrix = class DOMMatrix {
            constructor() { return [1, 0, 0, 1, 0, 0]; }
        };
    }

    // pdf-parse is CJS, dynamic import for compatibility
    const pdfModule = await import('pdf-parse') as any;
    // Handle both pdf-parse v1 (Function) and v2 (PDFParse Class) cleanly
    let rawText = '';
    if (pdfModule.PDFParse) {
        const uintBuffer = new Uint8Array(buffer);
        const instance = new pdfModule.PDFParse(uintBuffer);
        await instance.load();
        rawText = await instance.getText() || '';
    } else {
        const parseFn = pdfModule.default || pdfModule;
        const data = await parseFn(buffer);
        rawText = data.text || '';
    }

    const lines = rawText.split(/\r?\n/).filter((l: string) => l.trim().length > 0);

    return {
        headers: [],
        rows: [],
        rawText,
        rowCount: lines.length,
    };
}

/**
 * Detect file type from buffer magic bytes
 */
export function detectMimeFromBuffer(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return 'application/pdf';
    }
    // XLSX/ZIP: PK\x03\x04
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'image/png';
    }

    return null;
}
