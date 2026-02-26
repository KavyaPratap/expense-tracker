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

const GEMINI_MODEL = 'gemini-1.0-pro';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const EXTRACTION_PROMPT = `You are a transaction extraction engine. Extract all financial transactions from the provided bank statement data.

Each row generally follows this structure: Date | Description (Merchant) | Debit (Expense) | Credit (Income) | Balance

Rules:
1. If Debit has a value -> amount = Debit, type = "expense"
2. If Credit has a value -> amount = Credit, type = "income"
3. date MUST be in YYYY-MM-DD format
4. amount MUST be a positive number (no currency symbols)
5. merchant should be the cleaned business/person name
6. Ignore balance column, opening balance rows, and closing balance rows
7. Strip control characters and clean whitespace
8. Do NOT invent transactions that don't exist in the data
9. Return an empty array if no transactions are found

Return strictly valid JSON array. Format:
[
  {
    "date": "YYYY-MM-DD",
    "merchant": "string",
    "amount": number,
    "note": "string",
    "category": "Food | Groceries | Shopping | Utilities | Rent | Transport | Fuel | Entertainment | Health | Income | Education | Travel | Others"
  }
]

Return ONLY the JSON array. No markdown, no explanation.`;

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
