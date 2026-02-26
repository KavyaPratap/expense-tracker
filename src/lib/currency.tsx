
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

import { DollarSign, Euro, PoundSterling } from 'lucide-react';
import { cn } from "./utils";
import React from 'react';

const RupeeIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(className, "flex-shrink-0")}
    >
        <path d="M6 3h12" />
        <path d="M6 8h12" />
        <path d="m6 13 8.5 8" />
        <path d="M6 13h3" />
        <path d="M9 13c6.667 0 6.667-10 0-10" />
    </svg>
);

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
        case 'INR': return <RupeeIcon className={cn(className, "flex items-center justify-center")} />;
        default: return <DollarSign className={className} />;
    }
};

export const getCurrencySymbol = (currency: Settings['currency'] | string = "INR") => {
    const symbols: Record<string, string> = {
        USD: "$",
        EUR: "€",
        GBP: "£",
        INR: "\u20B9",
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
