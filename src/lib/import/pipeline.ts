/**
 * Import Pipeline Orchestrator
 * Coordinates file parsing → template detection → AI fallback →
 * validation → confidence scoring → duplicate detection → staging insert
 */

import { parseCSV, parseExcel, parsePDF, type ParseResult } from './parsers';
import { detectTemplate, parseWithTemplate, type ExtractedTransaction } from './templates';
import { extractWithGemini, extractFromImageWithGemini } from './gemini';
import {
    validateTransactions,
    computeConfidence,
    computeHash,
    detectDuplicates,
    fuzzyDuplicateCheck,
    type ExtractionSource,
    type ValidatedTransaction,
} from './validation';
import type { UserMerchantMap } from '@/lib/types';
import { createClient } from '@supabase/supabase-js';

export interface PipelineInput {
    jobId: string;
    userId: string;
    fileBuffer: Buffer;
    fileName: string;
    fileType: string;
    mimeType: string;
}

export interface PipelineResult {
    success: boolean;
    totalRows: number;
    processedRows: number;
    aiTokensUsed: number;
    aiCostEstimate: number;
    error?: string;
    processingTimeMs: number;
}

/**
 * Run the full import pipeline explicitly with a timeout to guarantee 
 * graceful failure before serverless function force-kill (60s limit).
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
    const TIMEOUT_MS = 50000; // 50 seconds to safely fall back before Vercel 60s timeout

    return Promise.race([
        executePipeline(input),
        new Promise<PipelineResult>((_, reject) =>
            setTimeout(() => reject(new Error('Processing timeout limit exceeded (50s). The file is too large or too complex.')), TIMEOUT_MS)
        )
    ]).catch(async (error) => {
        // Fallback catch for the race condition timeout
        const errorMsg = error instanceof Error ? error.message : 'Unknown pipeline error';
        console.error('Pipeline timeout/error:', errorMsg);

        const adminSupabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } }
        );

        await adminSupabase
            .from('import_jobs')
            .update({
                status: 'failed',
                error_message: errorMsg,
                processing_time_ms: TIMEOUT_MS,
            })
            .eq('id', input.jobId);

        return {
            success: false,
            totalRows: 0,
            processedRows: 0,
            aiTokensUsed: 0,
            aiCostEstimate: 0,
            error: errorMsg,
            processingTimeMs: TIMEOUT_MS,
        };
    });
}

/**
 * Core execution logic for the pipeline
 */
async function executePipeline(input: PipelineInput): Promise<PipelineResult> {
    const startTime = Date.now();

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: { persistSession: false },
            global: {
                headers: { 'x-pipeline-service': 'true' },
            },
        }
    );

    // Use service role key if available for bypassing RLS in pipeline
    const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        )
        : supabase;

    let aiTokensUsed = 0;
    let extractionSource: ExtractionSource = 'template';

    try {
        // ── Step 1: Update job status to processing ──
        await adminSupabase
            .from('import_jobs')
            .update({ status: 'processing' })
            .eq('id', input.jobId);

        // ── Step 2: Parse file ──
        let parseResult: ParseResult;
        let extracted: ExtractedTransaction[] = [];
        let isImage = false;

        if (input.mimeType === 'text/csv' || input.fileName.endsWith('.csv')) {
            const text = input.fileBuffer.toString('utf-8');
            parseResult = parseCSV(text);
        } else if (
            input.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            input.fileName.endsWith('.xlsx')
        ) {
            parseResult = parseExcel(input.fileBuffer);
        } else if (input.mimeType === 'application/pdf' || input.fileName.endsWith('.pdf')) {
            parseResult = await parsePDF(input.fileBuffer);
        } else if (input.mimeType.startsWith('image/')) {
            isImage = true;
            parseResult = { headers: [], rows: [], rawText: '', rowCount: 0 };
        } else {
            throw new Error(`Unsupported file type: ${input.mimeType}`);
        }

        // ── Step 3: Template detection + parsing ──
        if (!isImage && parseResult.rows.length > 0) {
            const template = detectTemplate(parseResult.headers, parseResult.rawText);
            if (template) {
                extracted = parseWithTemplate(parseResult.rows, parseResult.headers, template);
                extractionSource = 'template';
            }
        }

        // ── Step 4: AI fallback ──
        const geminiKey = process.env.GEMINI_API_KEY;

        if (extracted.length === 0 && geminiKey) {
            // Check daily AI token usage limit (50k tokens per user per day)
            // Retrieve today's usage from import_jobs
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const { data: usageData } = await adminSupabase
                .from('import_jobs')
                .select('ai_tokens_used')
                .eq('user_id', input.userId)
                .gte('created_at', startOfDay.toISOString());

            const todayTokens = (usageData || []).reduce((sum, job) => sum + (job.ai_tokens_used || 0), 0);
            const MAX_DAILY_TOKENS = 50000;

            if (todayTokens >= MAX_DAILY_TOKENS) {
                throw new Error(
                    `Daily AI processing limit exceeded (${Math.round(todayTokens / 1000)}k / ${MAX_DAILY_TOKENS / 1000}k tokens). Please try again tomorrow or use a supported bank format.`
                );
            }
            if (isImage) {
                // Image extraction via Gemini Vision
                const base64 = input.fileBuffer.toString('base64');
                const result = await extractFromImageWithGemini(base64, input.mimeType, geminiKey);
                extracted = result.transactions;
                aiTokensUsed = result.tokensUsed;
                extractionSource = 'ai_image';
            } else if (parseResult.rawText.trim().length > 0) {
                // Text extraction via Gemini
                const result = await extractWithGemini(parseResult.rawText, geminiKey);
                extracted = result.transactions;
                aiTokensUsed = result.tokensUsed;
                extractionSource = 'ai_text';
            }
        }

        if (extracted.length === 0) {
            throw new Error(
                'No transactions could be extracted from this file. Try a different format or check the file contents.'
            );
        }

        // ── Step 5: Validation ──
        const { valid, invalid } = validateTransactions(extracted);

        // Failure threshold: >50% invalid → job failed
        if (valid.length === 0 || (invalid.length > valid.length)) {
            throw new Error(
                `Too many invalid rows: ${invalid.length} invalid out of ${extracted.length} total. Fix your file and try again.`
            );
        }

        // ── Step 6: Load merchant map + existing hashes ──
        const { data: merchantMapData } = await adminSupabase
            .from('user_merchant_map')
            .select('*')
            .eq('user_id', input.userId);

        // Normalize the merchant map internally (lowercase & trim)
        const merchantMap: UserMerchantMap[] = (merchantMapData || []).map(m => ({
            ...m,
            merchant: m.merchant.toLowerCase().trim()
        }));

        const { data: existingTxData } = await adminSupabase
            .from('transactions')
            .select('unique_hash')
            .eq('user_id', input.userId)
            .not('unique_hash', 'is', null);
        const existingHashes = new Set(
            (existingTxData || []).map((t: { unique_hash: string }) => t.unique_hash)
        );

        // Also load hashes from other pending import jobs
        const { data: pendingImportTxs } = await adminSupabase
            .from('import_transactions')
            .select('unique_hash')
            .eq('user_id', input.userId);
        (pendingImportTxs || []).forEach((t: { unique_hash: string }) => {
            if (t.unique_hash) existingHashes.add(t.unique_hash);
        });

        // ── Step 7: Score confidence + compute hashes + detect duplicates ──
        const transactionsWithMeta = valid.map((tx, index) => {
            const hash = computeHash(input.userId, tx);
            const confidence = computeConfidence(tx, extractionSource, merchantMap);

            // Apply merchant map category if available (normalized match)
            let category = tx.category;
            const normalizedMerchant = tx.merchant.toLowerCase().trim();
            if (!category) {
                const mapped = merchantMap.find(
                    (m) => m.merchant === normalizedMerchant
                );
                if (mapped) category = mapped.category;
            }

            return { tx, hash, confidence, category, index };
        });

        const duplicateIndices = detectDuplicates(
            transactionsWithMeta.map((t) => ({ hash: t.hash, index: t.index })),
            existingHashes
        );

        // Also run fuzzy check for near-duplicates
        const { data: recentTxData } = await adminSupabase
            .from('transactions')
            .select('date, amount, merchant')
            .eq('user_id', input.userId)
            .order('date', { ascending: false })
            .limit(500);
        const recentTransactions = recentTxData || [];

        // ── Step 8: Insert into staging table ──
        const stagingRows = transactionsWithMeta.map((t) => {
            const isFuzzyDup =
                !duplicateIndices.has(t.index) &&
                fuzzyDuplicateCheck(t.tx, recentTransactions);

            return {
                job_id: input.jobId,
                user_id: input.userId,
                amount: t.tx.amount,
                date: t.tx.date,
                merchant: t.tx.merchant,
                note: t.tx.note || null,
                category: t.category || null,
                confidence: t.confidence,
                unique_hash: t.hash,
                is_duplicate: duplicateIndices.has(t.index) || isFuzzyDup,
                is_selected: !duplicateIndices.has(t.index) && !isFuzzyDup,
                raw_payload: { source: extractionSource },
            };
        });

        // Batch insert (Supabase handles up to 1000 per call)
        const batchSize = 500;
        for (let i = 0; i < stagingRows.length; i += batchSize) {
            const batch = stagingRows.slice(i, i + batchSize);
            const { error: insertError } = await adminSupabase
                .from('import_transactions')
                .insert(batch);
            if (insertError) {
                console.error('Staging insert error:', insertError);
                throw new Error(`Failed to save extracted transactions: ${insertError.message}`);
            }
        }

        // ── Step 9: Update job as ready ──
        const processingTimeMs = Date.now() - startTime;
        const aiCostEstimate = aiTokensUsed * 0.000001; // rough estimate

        await adminSupabase
            .from('import_jobs')
            .update({
                status: 'ready',
                total_rows: extracted.length,
                processed_rows: valid.length,
                ai_tokens_used: aiTokensUsed,
                ai_cost_estimate: aiCostEstimate,
                processing_time_ms: processingTimeMs,
            })
            .eq('id', input.jobId);

        return {
            success: true,
            totalRows: extracted.length,
            processedRows: valid.length,
            aiTokensUsed,
            aiCostEstimate,
            processingTimeMs,
        };
    } catch (error) {
        const processingTimeMs = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : 'Unknown pipeline error';

        await adminSupabase
            .from('import_jobs')
            .update({
                status: 'failed',
                error_message: errorMsg,
                processing_time_ms: processingTimeMs,
                ai_tokens_used: aiTokensUsed,
            })
            .eq('id', input.jobId);

        return {
            success: false,
            totalRows: 0,
            processedRows: 0,
            aiTokensUsed,
            aiCostEstimate: 0,
            error: errorMsg,
            processingTimeMs,
        };
    }
}
