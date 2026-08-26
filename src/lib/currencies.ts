export const CURRENCIES = [
  "AED",
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "IDR",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "PHP",
  "SGD",
  "THB",
  "USD",
  "VND",
] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "THB";

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === "string" &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}
