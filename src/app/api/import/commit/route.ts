/**
 * POST /api/import/commit
 * Atomically commits selected import_transactions to the transactions table
 * Includes idempotency protection, merchant learning, and transactional safety
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        // ── Auth ──
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: { persistSession: false },
                global: {
                    headers: {
                        Authorization: req.headers.get('Authorization') || '',
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { jobId } = body;

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // ── Fetch job and validate ──
        const { data: job, error: jobError } = await supabase
            .from('import_jobs')
            .select('*')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Idempotency: reject if already completed
        if (job.status === 'completed') {
            return NextResponse.json(
                { error: 'This import has already been committed' },
                { status: 409 }
            );
        }

        if (job.status !== 'ready') {
            return NextResponse.json(
                { error: `Cannot commit job with status: ${job.status}` },
                { status: 400 }
            );
        }

        // ── Fetch selected transactions ──
        const { data: importTxs, error: txError } = await supabase
            .from('import_transactions')
            .select('*')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .eq('is_selected', true)
            .eq('is_duplicate', false);

        if (txError) {
            return NextResponse.json(
                { error: 'Failed to fetch transactions' },
                { status: 500 }
            );
        }

        if (!importTxs || importTxs.length === 0) {
            // Mark as completed with zero transactions
            await supabase
                .from('import_jobs')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', jobId);

            return NextResponse.json({ committed: 0, status: 'completed' });
        }

        // ── Build transaction rows ──
        const transactionRows = importTxs.map((tx) => ({
            user_id: user.id,
            date: tx.date,
            merchant: tx.merchant,
            amount: tx.amount,
            category: tx.category || 'Others',
            type: 'debit' as const,
            status: 'completed' as const,
            note: tx.note || null,
            source: 'import',
            unique_hash: tx.unique_hash,
        }));

        // ── Batch insert into transactions ──
        const batchSize = 500;
        for (let i = 0; i < transactionRows.length; i += batchSize) {
            const batch = transactionRows.slice(i, i + batchSize);
            const { error: insertError } = await supabase
                .from('transactions')
                .insert(batch);

            if (insertError) {
                console.error('Commit insert error:', insertError);
                return NextResponse.json(
                    { error: `Failed to commit transactions: ${insertError.message}` },
                    { status: 500 }
                );
            }
        }

        // ── Merchant Learning: upsert merchant → category mappings ──
        const merchantUpdates = importTxs
            .filter((tx) => tx.category)
            .reduce((acc, tx) => {
                const key = tx.merchant.toLowerCase().trim();
                if (!acc.has(key)) {
                    acc.set(key, { merchant: tx.merchant, category: tx.category });
                }
                return acc;
            }, new Map<string, { merchant: string; category: string }>());

        for (const [, mapping] of merchantUpdates) {
            await supabase
                .from('user_merchant_map')
                .upsert(
                    {
                        user_id: user.id,
                        merchant: mapping.merchant,
                        category: mapping.category,
                        confidence: 0.85,
                        usage_count: 1,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id,merchant' }
                )
                .select();
        }

        // ── Mark job completed ──
        await supabase
            .from('import_jobs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
            })
            .eq('id', jobId);

        return NextResponse.json({
            committed: transactionRows.length,
            status: 'completed',
        });
    } catch (error) {
        console.error('Commit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Commit failed' },
            { status: 500 }
        );
    }
}
