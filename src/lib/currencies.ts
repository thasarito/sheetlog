export const CURRENCIES = ["THB", "USD", "EUR", "JPY", "GBP"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "THB";
