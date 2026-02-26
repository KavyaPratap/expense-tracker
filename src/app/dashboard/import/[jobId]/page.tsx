'use client';

import { useState, useMemo, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ImportPreviewRow } from '@/components/ImportPreviewRow';
import { useSupabase } from '@/lib/supabase/provider';
import { useCollection, useDoc } from '@/hooks/use-supabase';
import type { ImportJob, ImportTransaction, Category } from '@/lib/types';
import { getCurrencySymbol, CurrencyIcon } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    CheckCircle2,
    XCircle,
    Loader2,
    ArrowLeft,
    Filter,
    AlertTriangle,
    Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSWRConfig } from 'swr';

type FilterTab = 'all' | 'duplicates' | 'low_confidence';

export default function ImportPreviewPage({
    params,
}: {
    params: Promise<{ jobId: string }>;
}) {
    const { jobId } = use(params);
    const router = useRouter();
    const { session } = useSupabase();
    const user = session?.user;
    const { mutate } = useSWRConfig();

    const { data: job } = useDoc<ImportJob>(
        user ? `import_jobs?id=eq.${jobId}&user_id=eq.${user.id}` : null
    );

    const { data: transactions, isLoading } = useCollection<ImportTransaction>(
        user ? `import_transactions?job_id=eq.${jobId}&user_id=eq.${user.id}&order=date.desc` : null
    );

    const { data: categories } = useCollection<Category>(
        user ? `categories?user_id=eq.${user.id}` : null
    );

    const { data: settings } = useDoc<{ currency: string }>(
        user ? `settings?select=currency&user_id=eq.${user.id}` : null
    );

    const currencySymbol = getCurrencySymbol(settings?.currency);
    const [filter, setFilter] = useState<FilterTab>('all');
    const [isCommitting, setIsCommitting] = useState(false);
    const [localEdits, setLocalEdits] = useState<Record<string, Partial<ImportTransaction>>>({});
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    // Apply local edits to transactions
    const txList = useMemo(() => {
        if (!transactions) return [];
        return transactions.map((tx) => ({
            ...tx,
            ...localEdits[tx.id],
        }));
    }, [transactions, localEdits]);

    // Filtered list
    const filtered = useMemo(() => {
        switch (filter) {
            case 'duplicates':
                return txList.filter((t) => t.is_duplicate);
            case 'low_confidence':
                return txList.filter((t) => t.confidence < 0.7);
            default:
                return txList;
        }
    }, [txList, filter]);

    // Reset pagination when filter changes
    useMemo(() => setCurrentPage(1), [filter]);

    // Paginated list
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const paginatedTxs = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filtered.slice(start, start + ITEMS_PER_PAGE);
    }, [filtered, currentPage]);

    // Summary stats
    const summary = useMemo(() => {
        const total = txList.length;
        const selected = txList.filter((t) => t.is_selected && !t.is_duplicate).length;
        const duplicates = txList.filter((t) => t.is_duplicate).length;
        const lowConf = txList.filter((t) => t.confidence < 0.7).length;
        const totalAmount = txList
            .filter((t) => t.is_selected && !t.is_duplicate)
            .reduce((sum, t) => sum + t.amount, 0);
        return { total, selected, duplicates, lowConf, totalAmount };
    }, [txList]);

    const handleToggleSelect = useCallback(
        async (id: string, selected: boolean) => {
            setLocalEdits((prev) => ({
                ...prev,
                [id]: { ...prev[id], is_selected: selected },
            }));

            // Persist to DB
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            await supabase
                .from('import_transactions')
                .update({ is_selected: selected })
                .eq('id', id);
        },
        []
    );

    const handleFieldChange = useCallback(
        async (id: string, field: string, value: string | number) => {
            setLocalEdits((prev) => ({
                ...prev,
                [id]: { ...prev[id], [field]: value },
            }));

            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            await supabase
                .from('import_transactions')
                .update({ [field]: value })
                .eq('id', id);
        },
        []
    );

    const handleSelectAll = useCallback(
        async (selected: boolean) => {
            const updates: Record<string, Partial<ImportTransaction>> = {};
            filtered.forEach((tx) => {
                if (!tx.is_duplicate) {
                    updates[tx.id] = { ...localEdits[tx.id], is_selected: selected };
                }
            });
            setLocalEdits((prev) => ({ ...prev, ...updates }));

            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            const ids = filtered.filter((t) => !t.is_duplicate).map((t) => t.id);
            if (ids.length > 0) {
                await supabase
                    .from('import_transactions')
                    .update({ is_selected: selected })
                    .in('id', ids);
            }
        },
        [txList, localEdits]
    );

    const handleCommit = useCallback(async () => {
        if (!user || !job) return;
        setIsCommitting(true);

        try {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            const { data: { session: sess } } = await supabase.auth.getSession();

            const res = await fetch('/api/import/commit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sess?.access_token}`,
                },
                body: JSON.stringify({ jobId }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            toast.success(`${data.committed} transactions imported!`);
            mutate(`import_jobs?user_id=eq.${user.id}&order=created_at.desc`);
            mutate(`transactions?user_id=eq.${user.id}&order=date.desc`);
            router.push('/dashboard/import');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Commit failed');
        } finally {
            setIsCommitting(false);
        }
    }, [user, job, jobId, mutate, router]);

    const handleDiscard = useCallback(async () => {
        if (!user || !job) return;

        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        await supabase
            .from('import_jobs')
            .update({ discarded: true, status: 'failed', error_message: 'Discarded by user' })
            .eq('id', jobId);

        toast.info('Import discarded');
        mutate(`import_jobs?user_id=eq.${user.id}&order=created_at.desc`);
        router.push('/dashboard/import');
    }, [user, job, jobId, mutate, router]);

    if (!job || isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (job.status === 'completed') {
        return (
            <>
                <PageHeader title="Import Complete" subtitle="This import has already been committed" />
                <div className="flex flex-col items-center py-12 gap-4">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <p className="text-muted-foreground">All transactions have been imported.</p>
                    <Button variant="outline" onClick={() => router.push('/dashboard/import')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Import
                    </Button>
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader
                title="Review Import"
                subtitle={job.file_name}
            />

            {/* Summary Bar */}
            <Card className="mb-6">
                <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4 text-sm">
                            <span>
                                <strong>{summary.selected}</strong> / {summary.total} selected
                            </span>
                            {summary.duplicates > 0 && (
                                <span className="text-orange-600 flex items-center gap-1">
                                    <Copy className="h-3.5 w-3.5" />
                                    {summary.duplicates} duplicates
                                </span>
                            )}
                            {summary.lowConf > 0 && (
                                <span className="text-amber-600 flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {summary.lowConf} low confidence
                                </span>
                            )}
                        </div>
                        <div className="font-bold text-lg flex items-center gap-1">
                            <CurrencyIcon currency={settings?.currency} className="h-5 w-5" />
                            {summary.totalAmount.toFixed(2)}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 mb-4">
                {[
                    { key: 'all' as const, label: 'All', count: txList.length },
                    { key: 'duplicates' as const, label: 'Duplicates', count: summary.duplicates },
                    { key: 'low_confidence' as const, label: 'Low Confidence', count: summary.lowConf },
                ].map((tab) => (
                    <Button
                        key={tab.key}
                        variant={filter === tab.key ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter(tab.key)}
                        className="gap-1"
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-0.5 px-1.5">
                                {tab.count}
                            </Badge>
                        )}
                    </Button>
                ))}

                <div className="flex-1" />

                {/* Bulk actions */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(true)}
                >
                    Select All
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(false)}
                >
                    Deselect All
                </Button>
            </div>

            {/* Transaction List */}
            <div className="space-y-2 mb-6">
                {paginatedTxs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No transactions match this filter
                    </div>
                ) : (
                    paginatedTxs.map((tx) => (
                        <ImportPreviewRow
                            key={tx.id}
                            tx={tx}
                            categories={categories || []}
                            currencySymbol={currencySymbol}
                            onToggleSelect={handleToggleSelect}
                            onFieldChange={handleFieldChange}
                        />
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mb-24 px-2">
                    <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} entries
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Spacer if no pagination */}
            {totalPages <= 1 && <div className="h-24" />}

            {/* Bottom/Side Action Bar */}
            <div className="fixed z-50 max-md:top-1/2 max-md:right-4 max-md:-translate-y-1/2 max-md:bottom-auto max-md:left-auto max-md:w-auto max-md:bg-transparent max-md:border-none max-md:p-0 max-md:backdrop-blur-none bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 md:block">
                <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 md:gap-3">
                    <Button
                        variant="outline"
                        onClick={handleDiscard}
                        disabled={isCommitting}
                        className="max-md:shadow-lg max-md:bg-background max-md:w-12 max-md:h-12 max-md:rounded-full max-md:p-0"
                    >
                        <XCircle className="h-5 w-5 md:mr-2" />
                        <span className="md:inline hidden">Discard</span>
                    </Button>

                    <Button
                        onClick={handleCommit}
                        disabled={isCommitting || summary.selected === 0}
                        className="min-w-[160px] max-md:min-w-0 max-md:w-16 max-md:h-16 max-md:rounded-full max-md:shadow-2xl max-md:flex-col max-md:gap-0"
                    >
                        {isCommitting ? (
                            <>
                                <Loader2 className="h-5 w-5 md:mr-2 animate-spin" />
                                <span className="md:inline hidden">Importing...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="h-6 w-6 md:mr-2" />
                                <div className="flex flex-col items-center">
                                    <span className="md:inline hidden">Import {summary.selected} transactions</span>
                                    <span className="md:hidden text-[10px] font-bold leading-tight">{summary.selected}</span>
                                </div>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </>
    );
}
