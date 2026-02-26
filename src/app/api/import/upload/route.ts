/**
 * POST /api/import/upload
 * Receives file upload, validates, creates import_job, triggers async processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectMimeFromBuffer } from '@/lib/import/parsers';

const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const SIZE_LIMITS: Record<string, number> = {
    'image/jpeg': 5 * 1024 * 1024,
    'image/png': 5 * 1024 * 1024,
    'application/pdf': 10 * 1024 * 1024,
    'text/csv': 2 * 1024 * 1024,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 2 * 1024 * 1024,
};

export async function POST(req: NextRequest) {
    try {
        // ── Auth check ──
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

        // ── Parse FormData ──
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // ── MIME validation ──
        const buffer = Buffer.from(await file.arrayBuffer());
        const detectedMime = detectMimeFromBuffer(buffer);
        const declaredMime = file.type;

        // Use detected MIME if available, fallback to declared
        let mimeType = detectedMime || declaredMime;

        // CSV files don't have magic bytes, trust the extension/declared type
        if (!detectedMime && (declaredMime === 'text/csv' || file.name.endsWith('.csv'))) {
            mimeType = 'text/csv';
        }

        if (!ALLOWED_MIMES.has(mimeType)) {
            return NextResponse.json(
                { error: `Unsupported file type: ${mimeType}. Supported: CSV, Excel, PDF, JPEG, PNG` },
                { status: 400 }
            );
        }

        // ── Size validation ──
        const maxSize = SIZE_LIMITS[mimeType] || 5 * 1024 * 1024;
        if (buffer.length > maxSize) {
            return NextResponse.json(
                { error: `File too large. Max ${Math.round(maxSize / 1024 / 1024)}MB for ${mimeType}` },
                { status: 400 }
            );
        }

        // ── Rate limit: 3 imports/hour ──
        const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count: recentCount } = await supabase
            .from('import_jobs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', oneHourAgo);

        if ((recentCount || 0) >= 3) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Max 3 imports per hour.' },
                { status: 429 }
            );
        }

        // ── Concurrency guard: reject if active job exists ──
        const { data: activeJobs } = await supabase
            .from('import_jobs')
            .select('id')
            .eq('user_id', user.id)
            .in('status', ['queued', 'processing'])
            .limit(1);

        if (activeJobs && activeJobs.length > 0) {
            return NextResponse.json(
                { error: 'An import is already in progress. Please wait for it to complete.' },
                { status: 409 }
            );
        }

        // ── Create import job ──
        const { data: job, error: jobError } = await supabase
            .from('import_jobs')
            .insert({
                user_id: user.id,
                status: 'queued',
                file_type: mimeType,
                file_name: file.name,
                file_size: buffer.length,
            })
            .select()
            .single();

        if (jobError || !job) {
            return NextResponse.json(
                { error: 'Failed to create import job' },
                { status: 500 }
            );
        }

        // ── Trigger async processing ──
        // Fire-and-forget: call the process route internally
        const processUrl = new URL('/api/import/process', req.url);
        const authHeader = req.headers.get('Authorization') || '';

        // Non-blocking fetch — don't await
        fetch(processUrl.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify({
                jobId: job.id,
                userId: user.id,
                fileName: file.name,
                fileType: mimeType,
                mimeType,
                fileBase64: buffer.toString('base64'),
            }),
        }).catch((err) => {
            console.error('Failed to trigger processing:', err);
        });

        return NextResponse.json({ jobId: job.id, status: 'queued' });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
        );
    }
}
