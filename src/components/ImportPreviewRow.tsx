'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Category, ImportTransaction } from '@/lib/types';
import { useState } from 'react';
import { CurrencyIcon } from '@/lib/currency';

interface ImportPreviewRowProps {
    tx: ImportTransaction;
    categories: Category[];
    currencySymbol: string;
    onToggleSelect: (id: string, selected: boolean) => void;
    onFieldChange: (id: string, field: string, value: string | number) => void;
}

function confidenceColor(c: number): string {
    if (c >= 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (c >= 0.6) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
}

export const ImportPreviewRow = ({
    tx,
    categories,
    currencySymbol,
    onToggleSelect,
    onFieldChange,
}: ImportPreviewRowProps) => {
    const [isEditing, setIsEditing] = useState<string | null>(null);

    return (
        <div
            className={cn(
                'p-3 rounded-lg border transition-colors',
                tx.is_duplicate && 'opacity-50 bg-muted/30',
                !tx.is_selected && !tx.is_duplicate && 'opacity-60',
                tx.is_selected && !tx.is_duplicate && 'bg-card'
            )}
        >
            <div className="flex items-start gap-3">
                {/* Checkbox */}
                <Checkbox
                    checked={tx.is_selected}
                    onCheckedChange={(v) => onToggleSelect(tx.id, !!v)}
                    disabled={tx.is_duplicate}
                    className="mt-1"
                />

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                    {/* Row 1: Merchant + Amount */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            {isEditing === 'merchant' ? (
                                <Input
                                    autoFocus
                                    defaultValue={tx.merchant}
                                    className="h-7 text-sm"
                                    onBlur={(e) => {
                                        onFieldChange(tx.id, 'merchant', e.target.value);
                                        setIsEditing(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onFieldChange(tx.id, 'merchant', e.currentTarget.value);
                                            setIsEditing(null);
                                        }
                                    }}
                                />
                            ) : (
                                <p
                                    className="font-medium text-sm truncate cursor-pointer hover:text-primary transition-colors"
                                    onClick={() => setIsEditing('merchant')}
                                    title="Click to edit"
                                >
                                    {tx.merchant}
                                </p>
                            )}
                        </div>

                        {isEditing === 'amount' ? (
                            <Input
                                autoFocus
                                type="number"
                                step="0.01"
                                defaultValue={tx.amount}
                                className="h-7 text-sm w-28 text-right"
                                onBlur={(e) => {
                                    onFieldChange(tx.id, 'amount', parseFloat(e.target.value) || tx.amount);
                                    setIsEditing(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        onFieldChange(tx.id, 'amount', parseFloat(e.currentTarget.value) || tx.amount);
                                        setIsEditing(null);
                                    }
                                }}
                            />
                        ) : (
                            <p
                                className="font-bold text-sm cursor-pointer hover:text-primary transition-colors shrink-0 flex items-center"
                                onClick={() => setIsEditing('amount')}
                                title="Click to edit"
                            >
                                <CurrencyIcon currency={tx.raw_payload?.originalCurrency as string || 'INR'} className="h-4 w-4 mr-0.5" />
                                {tx.amount.toFixed(2)}
                            </p>
                        )}
                    </div>

                    {/* Row 2: Date + Category + Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {isEditing === 'date' ? (
                            <Input
                                autoFocus
                                type="date"
                                defaultValue={tx.date}
                                className="h-6 text-xs w-32"
                                onBlur={(e) => {
                                    onFieldChange(tx.id, 'date', e.target.value);
                                    setIsEditing(null);
                                }}
                            />
                        ) : (
                            <span
                                className="text-xs text-muted-foreground cursor-pointer hover:text-primary"
                                onClick={() => setIsEditing('date')}
                            >
                                {tx.date}
                            </span>
                        )}

                        <span className="text-muted-foreground text-xs">•</span>

                        {isEditing === 'custom_category' ? (
                            <div className="flex items-center gap-1">
                                <Input
                                    autoFocus
                                    placeholder="category name..."
                                    className="h-6 text-xs w-28 py-0 bg-muted/80 border-primary/50"
                                    onBlur={(e) => {
                                        if (e.target.value) {
                                            onFieldChange(tx.id, 'category', e.target.value);
                                        }
                                        setIsEditing(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (e.currentTarget.value) {
                                                onFieldChange(tx.id, 'category', e.currentTarget.value);
                                            }
                                            setIsEditing(null);
                                        } else if (e.key === 'Escape') {
                                            setIsEditing(null);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => setIsEditing(null)}
                                    className="text-[10px] text-muted-foreground hover:text-primary underline"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <Select
                                value={categories.some(c => c.name === tx.category) || tx.category === 'Others' ? tx.category : 'custom'}
                                onValueChange={(v) => {
                                    if (v === 'custom') {
                                        setIsEditing('custom_category');
                                    } else {
                                        onFieldChange(tx.id, 'category', v);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-6 text-xs w-auto min-w-[80px] border-0 bg-muted/50 px-2 flex items-center gap-1">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.name}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="Others">Others</SelectItem>
                                    <SelectItem value="custom" className="text-primary font-medium border-t">
                                        + Add Custom...
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        )}

                        {/* Confidence badge */}
                        <Badge className={cn('text-[10px] px-1.5 py-0', confidenceColor(tx.confidence))} variant="secondary">
                            {Math.round(tx.confidence * 100)}%
                        </Badge>

                        {/* Duplicate indicator */}
                        {tx.is_duplicate && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                <Copy className="h-2.5 w-2.5 mr-0.5" />
                                Duplicate
                            </Badge>
                        )}

                        {/* Low confidence warning */}
                        {tx.confidence < 0.7 && !tx.is_duplicate && (
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
