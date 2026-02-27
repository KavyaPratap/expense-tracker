
// A simple, non-API based currency conversion utility.
// Rates are approximate and for demonstration purposes.
// Base currency is USD.

import type { Settings } from "./types";

const RATES: Record<Settings['currency'], number> = {
    USD: 1,
    EUR: 0.93,
    GBP: 0.79,
    INR: 83.5,
};

import { DollarSign, Euro, PoundSterling, IndianRupee } from 'lucide-react';
import { cn } from "./utils";
import React from 'react';

export const CurrencyIcon = ({
    currency = "INR",
    className = "w-4 h-4"
}: {
    currency?: string;
    className?: string
}) => {
    switch (currency) {
        case 'EUR': return <Euro className={className} />;
        case 'GBP': return <PoundSterling className={className} />;
        case 'INR': return <IndianRupee className={cn(className, "flex-shrink-0")} />;
        default: return <DollarSign className={className} />;
    }
};

export const getCurrencySymbol = (currency: Settings['currency'] | string = "INR") => {
    const symbols: Record<string, string> = {
        USD: "$",
        EUR: "€",
        GBP: "£",
        INR: "₹",
    };
    return symbols[currency] || "$";
};

export const convertAmount = (
    amount: number,
    from: Settings['currency'],
    to: Settings['currency']
): number => {
    if (from === to) {
        return amount;
    }

    // 1. Convert 'from' currency to USD (the base)
    const amountInUsd = amount / RATES[from];

    // 2. Convert from USD to 'to' currency
    const convertedAmount = amountInUsd * RATES[to];

    return convertedAmount;
}
