/**
 * Bank Template Engine
 * Detects known bank statement formats and parses them with structured column mapping.
 * Avoids AI when a known format is detected.
 */

import type { ParsedRow } from './parsers';

export interface BankTemplate {
    name: string;
    bankNameRegex: RegExp;
    headerRegex?: RegExp;
    columnMap: {
        date: string[];       // possible column names for date
        amount: string[];     // possible column names for amount
        merchant: string[];   // possible column names for merchant/description
        note: string[];       // possible column names for notes/reference
        credit?: string[];    // separate credit column (some banks split credit/debit)
        debit?: string[];     // separate debit column
    };
    dateFormat?: string;    // hint for date parsing
}

export interface ExtractedTransaction {
    date: string;
    amount: number;
    merchant: string;
    note: string;
    category?: string;
}

const templates: BankTemplate[] = [
    {
        name: 'SBI (State Bank of India)',
        bankNameRegex: /state\s*bank|sbi/i,
        columnMap: {
            date: ['Txn Date', 'Value Date', 'Date', 'Transaction Date'],
            amount: ['Amount', 'Txn Amount'],
            merchant: ['Description', 'Narration', 'Particulars', 'Reference'],
            note: ['Ref No', 'Reference No', 'Chq/Ref Number'],
            credit: ['Credit', 'Deposit'],
            debit: ['Debit', 'Withdrawal'],
        },
    },
    {
        name: 'HDFC Bank',
        bankNameRegex: /hdfc/i,
        columnMap: {
            date: ['Date', 'Transaction Date', 'Value Date'],
            amount: ['Amount', 'Transaction Amount'],
            merchant: ['Narration', 'Description', 'Particulars'],
            note: ['Chq/Ref Number', 'Ref No'],
            credit: ['Credit Amount', 'Credit'],
            debit: ['Debit Amount', 'Debit', 'Withdrawal Amount'],
        },
    },
    {
        name: 'ICICI Bank',
        bankNameRegex: /icici/i,
        columnMap: {
            date: ['Transaction Date', 'Date', 'Value Date', 'S No.'],
            amount: ['Transaction Amount', 'Amount'],
            merchant: ['Transaction Remarks', 'Particulars', 'Description'],
            note: ['Cheque Number', 'Ref No'],
            credit: ['Deposit Amount', 'Credit Amount', 'Cr Amount'],
            debit: ['Withdrawal Amount', 'Debit Amount', 'Dr Amount'],
        },
    },
    {
        name: 'Axis Bank',
        bankNameRegex: /axis/i,
        columnMap: {
            date: ['Tran Date', 'Transaction Date', 'Date'],
            amount: ['Amount', 'Transaction Amount'],
            merchant: ['Particulars', 'Description', 'Narration'],
            note: ['Chq No', 'Ref No', 'Reference'],
            credit: ['Credit', 'CR'],
            debit: ['Debit', 'DR'],
        },
    },
    {
        name: 'Chase Bank',
        bankNameRegex: /chase|jpmorgan/i,
        columnMap: {
            date: ['Transaction Date', 'Posting Date', 'Date'],
            amount: ['Amount'],
            merchant: ['Description', 'Merchant Name', 'Name'],
            note: ['Memo', 'Reference', 'Category'],
        },
    },
    {
        name: 'Bank of America',
        bankNameRegex: /bank\s*of\s*america|bofa/i,
        columnMap: {
            date: ['Date', 'Posted Date'],
            amount: ['Amount'],
            merchant: ['Payee', 'Description'],
            note: ['Reference Number', 'Memo'],
        },
    },
    {
        name: 'Generic CSV',
        bankNameRegex: /./,  // catch-all — lowest priority
        columnMap: {
            date: ['date', 'Date', 'DATE', 'transaction_date', 'txn_date', 'posted_date'],
            amount: ['amount', 'Amount', 'AMOUNT', 'value', 'Value', 'total'],
            merchant: ['description', 'Description', 'merchant', 'Merchant', 'name', 'Name', 'payee', 'Payee', 'narration', 'Narration', 'particulars'],
            note: ['note', 'Note', 'memo', 'Memo', 'reference', 'Reference', 'ref', 'category'],
            credit: ['credit', 'Credit', 'deposit', 'Deposit'],
            debit: ['debit', 'Debit', 'withdrawal', 'Withdrawal'],
        },
    },
];

/**
 * Find the first matching column name from the headers
 */
function findColumn(headers: string[], candidates: string[]): string | null {
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
    for (const candidate of candidates) {
        const idx = normalizedHeaders.indexOf(candidate.toLowerCase().trim());
        if (idx !== -1) return headers[idx];
    }
    return null;
}

/**
 * Detect which bank template matches the given headers + raw text
 */
export function detectTemplate(headers: string[], rawText: string): BankTemplate | null {
    // Check raw text for bank name mentions first
    for (const template of templates) {
        // Skip generic catch-all for text detection
        if (template.name === 'Generic CSV') continue;
        if (template.bankNameRegex.test(rawText)) return template;
    }

    // Try to match by column structure (need at least date + amount + merchant)
    for (const template of templates) {
        const hasDate = findColumn(headers, template.columnMap.date) !== null;
        const hasAmount =
            findColumn(headers, template.columnMap.amount) !== null ||
            (template.columnMap.credit && findColumn(headers, template.columnMap.credit) !== null);
        const hasMerchant = findColumn(headers, template.columnMap.merchant) !== null;

        if (hasDate && hasAmount && hasMerchant) return template;
    }

    return null;
}

/**
 * Attempt to parse a date string into YYYY-MM-DD
 */
function parseDate(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 10);
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (ddmmyyyy) {
        const [, d, m, y] = ddmmyyyy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // MM/DD/YYYY (US format)
    const mmddyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (mmddyyyy) {
        const [, m, d, y] = mmddyyyy;
        const month = parseInt(m, 10);
        const day = parseInt(d, 10);
        if (month > 12) {
            return `${y}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
        }
        return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Mon DD, YYYY or DD Mon YYYY
    try {
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
        }
    } catch { /* ignore */ }

    return trimmed;
}

/**
 * Parse rows using a matched template
 */
export function parseWithTemplate(
    rows: ParsedRow[],
    headers: string[],
    template: BankTemplate
): ExtractedTransaction[] {
    const dateCol = findColumn(headers, template.columnMap.date);
    const amountCol = findColumn(headers, template.columnMap.amount);
    const merchantCol = findColumn(headers, template.columnMap.merchant);
    const noteCol = findColumn(headers, template.columnMap.note);
    const creditCol = template.columnMap.credit ? findColumn(headers, template.columnMap.credit) : null;
    const debitCol = template.columnMap.debit ? findColumn(headers, template.columnMap.debit) : null;

    if (!dateCol || !merchantCol) return [];

    const transactions: ExtractedTransaction[] = [];

    for (const row of rows) {
        const rawDate = row[dateCol] || '';
        const date = parseDate(rawDate);
        const merchant = (row[merchantCol] || '').trim();

        if (!date || !merchant) continue;

        let amount = 0;

        if (amountCol && row[amountCol]) {
            amount = Math.abs(parseFloat(row[amountCol].replace(/[^0-9.\-]/g, '')) || 0);
        } else if (creditCol && row[creditCol]) {
            amount = Math.abs(parseFloat(row[creditCol].replace(/[^0-9.\-]/g, '')) || 0);
        } else if (debitCol && row[debitCol]) {
            amount = Math.abs(parseFloat(row[debitCol].replace(/[^0-9.\-]/g, '')) || 0);
        }

        if (amount <= 0) continue;

        const note = noteCol ? (row[noteCol] || '').trim() : '';

        transactions.push({ date, amount, merchant, note });
    }

    return transactions;
}
