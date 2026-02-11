'use client';

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Check, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePathname } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const VoiceExpenseWidget = () => {
    const {
        isListening,
        transcript,
        interimTranscript,
        startListening,
        stopListening,
        reset,
        isSupported,
        error
    } = useVoiceInput();
    const { addTransaction } = useApp();
    const pathname = usePathname();

    // Track if we are currently dragging to prevent click/tap on release
    const isDragging = useRef(false);



    const [isOpen, setIsOpen] = useState(false);
    const [parsedAmount, setParsedAmount] = useState<string>("");
    const [parsedNote, setParsedNote] = useState<string>("");
    const [isProcessing, setIsProcessing] = useState(false);

    // Show error toast
    useEffect(() => {
        if (error) {
            toast.error(`Voice input error: ${error}`);
        }
    }, [error]);

    // Auto-open dialog when listening stops and we have a transcript
    useEffect(() => {
        if (!isListening && transcript) {
            parseTranscript(transcript);
            setIsOpen(true);
            // Don't reset immediately so we can see what was captured,
            // but we will reset when the dialog closes or submits.
        }
    }, [isListening, transcript]);

    const parseTranscript = (text: string) => {
        // Simple regex to find the first number. 
        // Matches integer or decimal: 50, 50.5, 50.00
        const amountMatch = text.match(/(\d+(\.\d{1,2})?)/);

        if (amountMatch) {
            const amount = amountMatch[0];
            // Remove the amount from the text to get the note
            const note = text.replace(amount, "").trim();
            setParsedAmount(amount);
            setParsedNote(note || "Quick Expense"); // Default note if empty
        } else {
            setParsedAmount("");
            setParsedNote(text);
        }
    };

    const handleSubmit = async () => {
        if (!parsedAmount) {
            toast.error("Could not detect an amount. Please enter one.");
            return;
        }

        const amount = parseFloat(parsedAmount);
        if (isNaN(amount) || amount <= 0) {
            toast.error("Invalid amount.");
            return;
        }

        // Optimistic UI: Close immediately
        handleClose();
        setIsProcessing(true); // Keep processing state for safety if we wanted to show it, but we are closing.

        const promise = addTransaction(
            {
                merchant: parsedNote, // utilizing merchant field for the quick description
                amount: amount,
                category: "General", // Will be auto-categorized by AI in AppContext if enabled
                status: "completed",
                type: "debit", // Assume debit for quick add
            },
            true // Enable auto-categorization
        ).finally(() => {
            setIsProcessing(false);
        });

        toast.promise(promise, {
            loading: 'Adding expense...',
            success: 'Expense added!',
            error: 'Failed to add expense',
        });
    };

    const handleClose = () => {
        setIsOpen(false);
        reset();
        setParsedAmount("");
        setParsedNote("");
    };

    // Hide on auth pages
    if (["/login", "/signup"].includes(pathname)) {
        return null;
    }

    if (!isSupported) return null;

    return (
        <>
            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0.1}
                whileDrag={{ scale: 1.1, cursor: "grabbing" }}
                whileTap={{ scale: 0.95 }}
                onDragStart={() => {
                    isDragging.current = true;
                }}
                onDragEnd={() => {
                    // Small timeout to allow tap to potentially fire if it was a very quick drag (unlikely with drag prop)
                    // but mainly to reset the flag. 
                    // However, we want to BLOCK the tap if it WAS a drag.
                    setTimeout(() => {
                        isDragging.current = false;
                    }, 50);
                }}
                onTap={() => {
                    if (!isDragging.current) {
                        toast.info("Mic tapped");
                        isListening ? stopListening() : startListening();
                    }
                }}
                className="fixed z-50 cursor-pointer"
                style={{ bottom: '1.5rem', right: '1.5rem', touchAction: 'none' }}
            >


                <Button
                    size="icon"
                    className={cn(
                        "h-14 w-14 rounded-full shadow-lg transition-all duration-300 pointer-events-none", // Ensure events are captured by motion.div
                        isListening
                            ? "bg-red-500 hover:bg-red-600 animate-pulse scale-110"
                            : "bg-primary hover:bg-primary/90"
                    )}
                >
                    {isListening ? (
                        <MicOff className="h-6 w-6 text-white" />
                    ) : (
                        <Mic className="h-6 w-6 text-white" />
                    )}
                </Button>
            </motion.div>

            <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirm Expense</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="amount" className="text-right">
                                Amount
                            </Label>
                            <Input
                                id="amount"
                                type="number"
                                value={parsedAmount}
                                onChange={(e) => setParsedAmount(e.target.value)}
                                className="col-span-3"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="note" className="text-right">
                                Note
                            </Label>
                            <Input
                                id="note"
                                value={parsedNote}
                                onChange={(e) => setParsedNote(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                            Original: "{transcript}"
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        <Button variant="ghost" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={isProcessing}>
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Expense
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
