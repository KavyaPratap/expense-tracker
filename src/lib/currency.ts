
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

export const getCurrencySymbol = (currency: Settings['currency'] | string = "USD") => {
    const symbols: Record<string, string> = {
        USD: "$",
        EUR: "\u20AC",
        GBP: "\u00A3",
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
