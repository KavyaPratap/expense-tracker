'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ImportUploadZone } from '@/components/ImportUploadZone';
import { ImportJobCard } from '@/components/ImportJobCard';
import { useSupabase } from '@/lib/supabase/provider';
import { useCollection } from '@/hooks/use-supabase';
import type { ImportJob } from '@/lib/types';
import { Loader2, Inbox } from 'lucide-react';
import { useSWRConfig } from 'swr';

export default function ImportPage() {
    const { session } = useSupabase();
    const user = session?.user;
    const { mutate } = useSWRConfig();

    const { data: jobs, isLoading } = useCollection<ImportJob>(
        user ? `import_jobs?user_id=eq.${user.id}&order=created_at.desc` : null
    );

    // Poll for active jobs every 3 seconds
    const hasActiveJob = jobs?.some((j) => j.status === 'queued' || j.status === 'processing');

    useEffect(() => {
        if (!hasActiveJob || !user) return;

        const interval = setInterval(() => {
            mutate(`import_jobs?user_id=eq.${user.id}&order=created_at.desc`);
        }, 3000);

        return () => clearInterval(interval);
    }, [hasActiveJob, user, mutate]);

    const handleUploadComplete = useCallback(
        (jobId: string) => {
            if (user) {
                // Immediately refresh the jobs list
                mutate(`import_jobs?user_id=eq.${user.id}&order=created_at.desc`);
            }
        },
        [user, mutate]
    );

    const uploadDisabled = hasActiveJob || false;

    return (
        <div className="max-w-2xl mx-auto">
            <PageHeader
                title="Import"
                subtitle="Import transactions from bank statements"
            />

            {/* Upload Zone */}
            <div className="mb-8">
                <ImportUploadZone
                    onUploadComplete={handleUploadComplete}
                    disabled={uploadDisabled}
                />
                {uploadDisabled && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        An import is already in progress. Please wait for it to complete.
                    </p>
                )}
            </div>

            {/* Import History */}
            <div>
                <h2 className="text-lg font-semibold mb-3">Import History</h2>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : !jobs || jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Inbox className="h-10 w-10 mb-3 opacity-50" />
                        <p className="text-sm">No imports yet</p>
                        <p className="text-xs mt-1">Upload a bank statement to get started</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {jobs.map((job) => (
                            <ImportJobCard key={job.id} job={job} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
