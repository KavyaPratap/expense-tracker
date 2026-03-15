// A simple, non-API based currency conversion utility.
// Rates are approximate and for demonstration purposes.
// Base currency is USD.

import type { Settings } from "./types";
import { DollarSign, Euro, PoundSterling } from 'lucide-react';
import { cn } from "./utils";
import React from 'react';

const RATES: Record<Settings['currency'], number> = {
    USD: 1,
    EUR: 0.87,
    GBP: 0.76,
    INR: 92.58,
};

// Normalize currency: if not a valid supported currency, force to INR
const normalizeCurrency = (currency?: string): string => {
    const valid = ['USD', 'EUR', 'GBP', 'INR'];
    if (!currency || !valid.includes(currency)) return 'INR';
    return currency;
};

// We use an SVG <text> tag to render the native font's Rupee symbol.
// This allows it to scale with Tailwind w-8 h-8 classes exactly like a Lucide icon,
// while keeping the "perfect" Rupee look that your system fonts provide.
const NativeRupeeIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <text
      x="50%"
      y="52%" /* Slightly offset to center properly in the viewBox */
      dominantBaseline="middle"
      textAnchor="middle"
      fontSize="19"
      fontFamily="system-ui, -apple-system, Arial, sans-serif"
      fontWeight="bold"
    >
      {"\u20B9"}
    </text>
  </svg>
);

export const CurrencyIcon = ({
    currency,
    className = "w-4 h-4"
}: {
    currency?: string;
    className?: string
}) => {
    const normalized = normalizeCurrency(currency);
    switch (normalized) {
        case 'USD': return <DollarSign className={className} />;
        case 'EUR': return <Euro className={className} />;
        case 'GBP': return <PoundSterling className={className} />;
        case 'INR':
        default:
            return <NativeRupeeIcon className={cn(className, "flex-shrink-0")} />;
    }
};

export const getCurrencySymbol = (currency?: Settings['currency'] | string) => {
    const normalized = normalizeCurrency(currency);
    const symbols: Record<string, string> = {
        USD: "$",
        EUR: "€",
        GBP: "£",
        INR: "\u20B9",
    };
    return symbols[normalized] || "\u20B9";
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