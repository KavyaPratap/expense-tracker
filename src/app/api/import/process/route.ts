/**
 * POST /api/import/process
 * Internal async worker — called by upload route in background
 * Runs the full import pipeline 
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/import/pipeline';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel/serverless timeout

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { jobId, userId, sourceCurrency } = body;

        if (!jobId || !userId) {
            return NextResponse.json({ error: 'Missing jobId or userId' }, { status: 400 });
        }

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

        // Fetch job details
        const { data: job, error: jobError } = await supabase
            .from('import_jobs')
            .select('file_path, file_name, file_type')
            .eq('id', jobId)
            .single();

        if (jobError || !job || !job.file_path) {
            return NextResponse.json({ error: 'Job not found or missing file_path' }, { status: 404 });
        }

        // Download file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('import_files')
            .download(job.file_path);

        if (downloadError || !fileData) {
            throw new Error(`Failed to download file: ${downloadError?.message}`);
        }

        const fileBuffer = Buffer.from(await fileData.arrayBuffer());

        // Run the pipeline (this is the long-running operation)
        const result = await runPipeline({
            jobId,
            userId,
            fileBuffer,
            fileName: job.file_name,
            fileType: job.file_type,
            mimeType: job.file_type,
            authHeader: req.headers.get('Authorization') || undefined,
            sourceCurrency,
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Process route error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Processing failed' },
            { status: 500 }
        );
    }
}
