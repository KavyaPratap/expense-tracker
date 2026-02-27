const GEMINI_MODEL = 'gemini-2.5-flash';
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

async function testGemini() {
    console.log("Starting test...");
    // A fake 1x1 png image
    const pngHex = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082';
    const buffer = Buffer.from(pngHex, 'hex');
    const base64 = buffer.toString('base64');
    const mimeType = 'image/png';
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("NO API KEY");
        return;
    }

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
                                data: base64,
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
        console.error(`Gemini Vision API error (${response.status}): ${errorText}`);
        return;
    }

    const data = await response.json();
    console.log("Success:", JSON.stringify(data, null, 2));
}

testGemini();
