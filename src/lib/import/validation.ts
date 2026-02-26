/**
 * Validation Layer — Zod schemas, confidence scoring, duplicate detection
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import type { UserMerchantMap } from '@/lib/types';

// ── Zod Schema ──────────────────────────────────────────────

export const extractedTransactionSchema = z.object({
    date: z
        .string()
        .refine((d) => /^\d{4}-\d{2}-\d{2}$/.test(d), 'Invalid date format')
        .refine((d) => {
            const parsed = new Date(d);
            return !isNaN(parsed.getTime()) && parsed <= new Date();
        }, 'Date cannot be in the future'),
    amount: z.number().positive('Amount must be greater than 0').max(10_000_000, 'Amount too large'),
    merchant: z.string().min(1, 'Merchant name required').max(200),
    note: z.string().max(500).optional().default(''),
    category: z.string().max(50).optional(),
});

export type ValidatedTransaction = z.infer<typeof extractedTransactionSchema>;

export interface ValidationResult {
    valid: ValidatedTransaction[];
    invalid: { row: Record<string, unknown>; errors: string[] }[];
}

/**
 * Validate an array of raw extracted transactions
 */
export function validateTransactions(
    raw: { date: string; amount: number; merchant: string; note?: string; category?: string }[]
): ValidationResult {
    const valid: ValidatedTransaction[] = [];
    const invalid: ValidationResult['invalid'] = [];

    for (const tx of raw) {
        const result = extractedTransactionSchema.safeParse(tx);
        if (result.success) {
            valid.push(result.data);
        } else {
            invalid.push({
                row: tx as Record<string, unknown>,
                errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
            });
        }
    }

    return { valid, invalid };
}

// ── Confidence Scoring ──────────────────────────────────────

export type ExtractionSource = 'template' | 'ai_text' | 'ai_image';

/**
 * Compute confidence score (0.0 – 1.0) for a transaction
 */
export function computeConfidence(
    tx: ValidatedTransaction,
    source: ExtractionSource,
    merchantMap: UserMerchantMap[]
): number {
    // Base confidence by source
    let score = source === 'template' ? 0.9 : source === 'ai_text' ? 0.65 : 0.55;

    // Boost: merchant exists in user's merchant map
    const mapped = merchantMap.find(
        (m) => m.merchant.toLowerCase() === tx.merchant.toLowerCase()
    );
    if (mapped) {
        score += 0.15;
        // Extra boost for high-usage merchants
        if (mapped.usage_count >= 5) score += 0.05;
    }

    // Penalty: ambiguous date (could be MM/DD or DD/MM)
    const dateParts = tx.date.split('-');
    const day = parseInt(dateParts[2], 10);
    const month = parseInt(dateParts[1], 10);
    if (day <= 12 && month <= 12 && day !== month) {
        score -= 0.1;
    }

    // Penalty: image extraction
    if (source === 'ai_image') {
        score -= 0.05;
    }

    // Clamp
    return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// ── Duplicate Detection ─────────────────────────────────────

/**
 * Compute a unique hash for a transaction (deterministic)
 */
export function computeHash(userId: string, tx: ValidatedTransaction): string {
    const normalized = [
        userId,
        Math.round(tx.amount * 100).toString(), // normalize to cents
        tx.date,
        tx.merchant.toLowerCase().trim(),
        (tx.note || '').toLowerCase().trim(),
    ].join('|');

    return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Detect duplicates within a batch and against existing DB hashes
 */
export function detectDuplicates(
    transactions: { hash: string; index: number }[],
    existingHashes: Set<string>
): Set<number> {
    const duplicateIndices = new Set<number>();
    const seenInBatch = new Map<string, number>();

    for (const { hash, index } of transactions) {
        // Check against existing DB
        if (existingHashes.has(hash)) {
            duplicateIndices.add(index);
            continue;
        }

        // Check within batch
        if (seenInBatch.has(hash)) {
            duplicateIndices.add(index);
        } else {
            seenInBatch.set(hash, index);
        }
    }

    return duplicateIndices;
}

/**
 * Fuzzy duplicate check: same merchant + same amount + date ±1 day
 */
export function fuzzyDuplicateCheck(
    tx: ValidatedTransaction,
    existing: { date: string; amount: number; merchant: string }[]
): boolean {
    const txDate = new Date(tx.date).getTime();
    const oneDayMs = 86_400_000;

    return existing.some((e) => {
        if (e.merchant.toLowerCase() !== tx.merchant.toLowerCase()) return false;
        if (Math.abs(e.amount - tx.amount) > 0.01) return false;
        const eDate = new Date(e.date).getTime();
        return Math.abs(txDate - eDate) <= oneDayMs;
    });
}
