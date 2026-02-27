'use client';

import { useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Upload,
    FileSpreadsheet,
    FileText,
    Image,
    Loader2,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { getCurrencySymbol } from '@/lib/currency';

interface ImportUploadZoneProps {
    onUploadComplete: (jobId: string) => void;
    disabled?: boolean;
}

const FILE_TYPE_INFO = [
    { ext: 'CSV', icon: FileSpreadsheet, color: 'text-green-500', maxMB: 2 },
    { ext: 'Excel', icon: FileSpreadsheet, color: 'text-blue-500', maxMB: 2 },
    { ext: 'PDF', icon: FileText, color: 'text-red-500', maxMB: 4 },
    { ext: 'Image', icon: Image, color: 'text-purple-500', maxMB: 4 },
];

const ACCEPT =
    '.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/jpeg,image/png';

export const ImportUploadZone = ({ onUploadComplete, disabled }: ImportUploadZoneProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [sourceCurrency, setSourceCurrency] = useState('USD');

    const handleUpload = useCallback(
        async (file: File) => {
            setUploadState('uploading');
            setProgress(10);
            setErrorMsg('');

            try {
                // Get auth token
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();

                if (!session?.access_token) {
                    throw new Error('Please log in to import transactions');
                }

                setProgress(30);

                // Workaround for Capacitor Android WebView native File streaming bugs
                // We read the file fully into memory first to guarantee the body isn't empty or locked
                const fileToBlob = async (f: File): Promise<Blob> => {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            if (e.target?.result instanceof ArrayBuffer) {
                                resolve(new Blob([e.target.result], { type: f.type || 'application/octet-stream' }));
                            } else {
                                reject(new Error("Could not construct file buffer"));
                            }
                        };
                        reader.onerror = () => reject(new Error("Failed to read the file. Please check device permissions."));
                        reader.readAsArrayBuffer(f);
                    });
                };

                const memoryBlob = await fileToBlob(file);

                const formData = new FormData();
                formData.append('file', memoryBlob, file.name || 'upload.tmp');

                // Use absolute URL on mobile to avoid internal Capacitor fetch issues
                const API_BASE = Capacitor.isNativePlatform()
                    ? 'https://expense-tracker-five-mu-77.vercel.app'
                    : '';

                const uploadResponse = await fetch(`${API_BASE}/api/import/upload`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: formData,
                });

                setProgress(50);

                const uploadData = await uploadResponse.json();

                if (!uploadResponse.ok) {
                    throw new Error(uploadData.error || 'Upload failed');
                }

                // Call the processing route explicitly from the client
                // This ensures the serverless function runs reliably while the client waits
                const processResponse = await fetch(`${API_BASE}/api/import/process`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        jobId: uploadData.jobId,
                        userId: session.user.id,
                        sourceCurrency: sourceCurrency, // Send the selected currency
                    }),
                });

                setProgress(80);

                const processData = await processResponse.json();

                if (!processResponse.ok) {
                    throw new Error(processData.error || 'Processing failed to start');
                }

                setProgress(100);
                setUploadState('success');
                toast.success('File uploaded and processing started...');
                onUploadComplete(uploadData.jobId);

                // Reset after 2s
                setTimeout(() => {
                    setUploadState('idle');
                    setProgress(0);
                }, 2000);
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Upload failed';
                setErrorMsg(msg);
                setUploadState('error');
                toast.error(msg);

                setTimeout(() => {
                    setUploadState('idle');
                    setProgress(0);
                    setErrorMsg('');
                }, 3000);
            }
        },
        [onUploadComplete]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (disabled || uploadState === 'uploading') return;

            const file = e.dataTransfer.files[0];
            if (file) handleUpload(file);
        },
        [disabled, uploadState, handleUpload]
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
        [handleUpload]
    );

    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <span className="text-sm font-medium text-muted-foreground">Statement Currency:</span>
                    <Select value={sourceCurrency} onValueChange={setSourceCurrency}>
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="INR">INR (₹)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                            <SelectItem value="GBP">GBP (£)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        if (!disabled) setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={cn(
                        'relative flex flex-col items-center justify-center p-8 md:p-12 transition-all duration-300 cursor-pointer border-2 border-dashed rounded-lg m-4',
                        isDragging
                            ? 'border-primary bg-primary/5 scale-[1.01]'
                            : 'border-border hover:border-primary/50 hover:bg-muted/30',
                        disabled && 'opacity-50 cursor-not-allowed',
                        uploadState === 'uploading' && 'pointer-events-none'
                    )}
                    onClick={() => {
                        if (!disabled && uploadState === 'idle') fileInputRef.current?.click();
                    }}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT}
                        onChange={handleFileSelect}
                        className="hidden"
                    />

                    <AnimatePresence mode="wait">
                        {uploadState === 'idle' && (
                            <motion.div
                                key="idle"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="flex flex-col items-center gap-4"
                            >
                                <div className="p-4 rounded-full bg-primary/10">
                                    <Upload className="h-8 w-8 text-primary" />
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-lg">Drop your bank statement here</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        or click to browse files
                                    </p>
                                </div>

                                <div className="flex gap-4 mt-2">
                                    {FILE_TYPE_INFO.map((ft) => {
                                        const Icon = ft.icon;
                                        return (
                                            <div
                                                key={ft.ext}
                                                className="flex flex-col items-center gap-1"
                                            >
                                                <Icon className={cn('h-5 w-5', ft.color)} />
                                                <span className="text-[10px] text-muted-foreground">
                                                    {ft.ext}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                        {uploadState === 'uploading' && (
                            <motion.div
                                key="uploading"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center gap-4"
                            >
                                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                <p className="font-medium">Uploading & processing...</p>
                                <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-primary rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </motion.div>
                        )}

                        {uploadState === 'success' && (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center gap-3"
                            >
                                <CheckCircle2 className="h-10 w-10 text-green-500" />
                                <p className="font-medium text-green-600">Upload complete!</p>
                            </motion.div>
                        )}

                        {uploadState === 'error' && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center gap-3"
                            >
                                <AlertCircle className="h-10 w-10 text-destructive" />
                                <p className="font-medium text-destructive">{errorMsg || 'Upload failed'}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setUploadState('idle');
                                    }}
                                >
                                    Try again
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </CardContent>
        </Card>
    );
};
