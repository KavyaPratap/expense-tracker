/**
 * Groq AI Extraction — Secondary fallback for structured extraction
 * Uses llama-3.1-70b-versatile for fast, high-quality extraction
 */

export interface GroqExtractionResult {
    transactions: {
        date: string;
        amount: number;
        merchant: string;
        note: string;
        category?: string;
    }[];
    tokensUsed: number;
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
 * Extract transactions from text using Groq API
 */
export async function extractWithGroq(
    textContent: string,
    apiKey: string
): Promise<GroqExtractionResult> {
    // Sanitize input — strip control characters
    const sanitized = textContent
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .trim()
        .slice(0, 30000); // 30k chars limit for Groq safety

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: EXTRACTION_PROMPT },
                { role: 'user', content: `Data to extract transactions from:\n\n${sanitized}` },
            ],
            temperature: 0,
            stream: false,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.choices[0]?.message?.content || '[]';

    // Groq usage is tracked in tokens
    const tokensUsed = data.usage?.total_tokens || 0;

    // Parse the JSON response
    let transactions: GroqExtractionResult['transactions'] = [];
    try {
        const parsed = JSON.parse(responseText);
        // Groq sometimes wraps in a key or returns the array directly
        transactions = Array.isArray(parsed) ? parsed : (parsed.transactions || Object.values(parsed).find(v => Array.isArray(v)) || []);
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
