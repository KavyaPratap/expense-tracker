/**
 * Gemini AI Extraction — Fallback when no bank template matches
 * Uses gemini-1.5-flash for cost-efficient structured extraction
 */

export interface GeminiExtractionResult {
    transactions: {
        date: string;
        amount: number;
        merchant: string;
        note: string;
        category?: string;
    }[];
    tokensUsed: number;
}

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const EXTRACTION_PROMPT = `You are a transaction extraction engine. Extract all financial transactions from the provided text/data.

For each transaction, return EXACTLY this JSON structure:
{
  "date": "YYYY-MM-DD",
  "amount": <positive number>,
  "merchant": "<merchant/description name>",
  "note": "<any additional reference or note>",
  "category": "<best guess category>"
}

Rules:
- date MUST be in YYYY-MM-DD format
- amount MUST be a positive number (no currency symbols)
- merchant should be the cleaned business/person name
- If amount has both credit and debit, use the non-zero value
- If date is ambiguous (DD/MM vs MM/DD), prefer DD/MM for dates where day > 12
- Strip control characters and clean whitespace
- Do NOT invent transactions that don't exist in the data
- Return an empty array if no transactions are found

Categories to choose from: Food, Groceries, Shopping, Utilities, Rent, Transport, Fuel, Entertainment, Health, Income, Education, Travel, Others

Return ONLY a valid JSON array. No markdown, no explanation.`;

/**
 * Extract transactions from text using Gemini API
 */
export async function extractWithGemini(
    textContent: string,
    apiKey: string
): Promise<GeminiExtractionResult> {
    // Sanitize input — strip control characters
    const sanitized = textContent
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .trim()
        .slice(0, 50000); // Max input size

    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: EXTRACTION_PROMPT },
                        { text: `\n\nData to extract transactions from:\n\n${sanitized}` },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0,
                topP: 1,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Extract text from Gemini response
    const responseText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Track token usage
    const tokensUsed =
        (data?.usageMetadata?.promptTokenCount || 0) +
        (data?.usageMetadata?.candidatesTokenCount || 0);

    // Parse the JSON response
    let transactions: GeminiExtractionResult['transactions'] = [];
    try {
        const parsed = JSON.parse(responseText);
        transactions = Array.isArray(parsed) ? parsed : parsed.transactions || [];
    } catch {
        // Try to extract JSON array from the response
        const match = responseText.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                transactions = JSON.parse(match[0]);
            } catch {
                transactions = [];
            }
        }
    }

    // Clean & validate each transaction minimally
    transactions = transactions
        .filter(
            (t) =>
                t &&
                typeof t.amount === 'number' &&
                t.amount > 0 &&
                typeof t.merchant === 'string' &&
                t.merchant.trim().length > 0
        )
        .map((t) => ({
            date: String(t.date || '').trim(),
            amount: Math.abs(Number(t.amount)),
            merchant: String(t.merchant || '').trim().slice(0, 200),
            note: String(t.note || '').trim().slice(0, 500),
            category: t.category ? String(t.category).trim() : undefined,
        }));

    return { transactions, tokensUsed };
}

/**
 * Extract transactions from an image using Gemini Vision
 */
export async function extractFromImageWithGemini(
    imageBase64: string,
    mimeType: string,
    apiKey: string
): Promise<GeminiExtractionResult> {
    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: EXTRACTION_PROMPT },
                        {
                            inlineData: {
                                mimeType,
                                data: imageBase64,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0,
                topP: 1,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Vision API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const responseText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const tokensUsed =
        (data?.usageMetadata?.promptTokenCount || 0) +
        (data?.usageMetadata?.candidatesTokenCount || 0);

    let transactions: GeminiExtractionResult['transactions'] = [];
    try {
        const parsed = JSON.parse(responseText);
        transactions = Array.isArray(parsed) ? parsed : parsed.transactions || [];
    } catch {
        const match = responseText.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                transactions = JSON.parse(match[0]);
            } catch {
                transactions = [];
            }
        }
    }

    transactions = transactions
        .filter(
            (t) =>
                t &&
                typeof t.amount === 'number' &&
                t.amount > 0 &&
                typeof t.merchant === 'string' &&
                t.merchant.trim().length > 0
        )
        .map((t) => ({
            date: String(t.date || '').trim(),
            amount: Math.abs(Number(t.amount)),
            merchant: String(t.merchant || '').trim().slice(0, 200),
            note: String(t.note || '').trim().slice(0, 500),
            category: t.category ? String(t.category).trim() : undefined,
        }));

    return { transactions, tokensUsed };
}
