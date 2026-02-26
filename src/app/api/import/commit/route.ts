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

        // ── Atomic Commit via RPC ──
        // This Postgres function handles the transaction inserts, merchant learning,
        // and marking the job as completed in a single secure database transaction.
        const { data: committedCount, error: rpcError } = await supabase.rpc(
            'commit_import_job',
            { p_job_id: jobId, p_user_id: user.id }
        );

        if (rpcError) {
            console.error('Commit RPC error:', rpcError);
            return NextResponse.json(
                { error: `Failed to commit transactions: ${rpcError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            committed: committedCount || 0,
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
