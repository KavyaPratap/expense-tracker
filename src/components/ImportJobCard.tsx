'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    FileSpreadsheet,
    FileText,
    Image,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Clock,
    Eye,
    ChevronRight,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImportJob } from '@/lib/types';
import Link from 'next/link';
import { useState } from 'react';
import { useSupabase } from '@/lib/supabase/provider';
import { useSWRConfig } from 'swr';
import { toast } from 'sonner';

interface ImportJobCardProps {
    job: ImportJob;
}

const STATUS_CONFIG = {
    queued: { label: 'Queued', icon: Clock, color: 'bg-muted text-muted-foreground' },
    processing: { label: 'Processing', icon: Loader2, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    ready: { label: 'Ready for Review', icon: Eye, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    failed: { label: 'Failed', icon: AlertCircle, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function getFileIcon(fileType: string) {
    if (fileType.startsWith('image/')) return Image;
    if (fileType.includes('pdf')) return FileText;
    return FileSpreadsheet;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export const ImportJobCard = ({ job }: ImportJobCardProps) => {
    const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
    const StatusIcon = config.icon;
    const FileIcon = getFileIcon(job.file_type);
    const isProcessing = job.status === 'processing';
    const isReady = job.status === 'ready';

    const [isDeleting, setIsDeleting] = useState(false);
    const { session } = useSupabase();
    const { mutate } = useSWRConfig();

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session?.user || isDeleting) return;

        if (!confirm('Are you sure you want to remove this import job?')) {
            return;
        }

        setIsDeleting(true);
        try {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();

            const { error } = await supabase
                .from('import_jobs')
                .delete()
                .eq('id', job.id)
                .eq('user_id', session.user.id);

            if (error) throw error;

            toast.success('Import job removed');
            mutate(`import_jobs?user_id=eq.${session.user.id}&order=created_at.desc`);
        } catch (error) {
            console.error('Failed to delete job:', error);
            toast.error('Failed to remove job');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Card className={cn(
            'transition-all duration-200 group',
            isReady && 'ring-1 ring-amber-300 dark:ring-amber-700',
            isDeleting && 'opacity-50 pointer-events-none'
        )}>
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    {/* File icon */}
                    <div className="p-2 rounded-lg bg-muted shrink-0">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{job.file_name}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{formatFileSize(job.file_size)}</span>
                            <span>•</span>
                            <span>{timeAgo(job.created_at)}</span>
                            {job.total_rows > 0 && (
                                <>
                                    <span>•</span>
                                    <span>{job.total_rows} rows</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Status + Action */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn('text-xs', config.color)} variant="secondary">
                            <StatusIcon className={cn('h-3 w-3 mr-1', isProcessing && 'animate-spin')} />
                            {config.label}
                        </Badge>

                        {isReady ? (
                            <Link href={`/dashboard/import/${job.id}`}>
                                <Button size="sm" className="gap-1">
                                    Review
                                    <ChevronRight className="h-3 w-3" />
                                </Button>
                            </Link>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                title="Remove imported job"
                            >
                                {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Processing progress bar */}
                {isProcessing && (
                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                )}

                {/* Error message */}
                {job.status === 'failed' && job.error_message && (
                    <p className="mt-2 text-xs text-destructive truncate">{job.error_message}</p>
                )}
            </CardContent>
        </Card>
    );
};
