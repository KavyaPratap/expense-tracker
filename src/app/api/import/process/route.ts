/**
 * POST /api/import/process
 * Internal async worker — called by upload route in background
 * Runs the full import pipeline 
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/import/pipeline';

export const maxDuration = 60; // Vercel/serverless timeout

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { jobId, userId, fileName, fileType, mimeType, fileBase64 } = body;

        if (!jobId || !userId || !fileBase64) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const fileBuffer = Buffer.from(fileBase64, 'base64');

        // Run the pipeline (this is the long-running operation)
        const result = await runPipeline({
            jobId,
            userId,
            fileBuffer,
            fileName,
            fileType,
            mimeType,
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
