import { CircleDollarSign } from 'lucide-react';
import { CURRENCIES, type Currency } from '../lib/currencies';

type Props = {
  value: Currency;
  disabled: boolean;
  onChange: (currency: Currency) => void;
};

export function AnalyticsBaseCurrencySetting({ value, disabled, onChange }: Props) {
  return (
    <div className="flex min-h-14 items-center gap-3 bg-card px-4 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#007AFF] text-white">
        <CircleDollarSign className="h-4 w-4" />
      </div>
      <label htmlFor="analytics-base-currency" className="min-w-0 flex-1 text-[17px]">
        Base currency
      </label>
      <select
        id="analytics-base-currency"
        aria-label="Analytics base currency"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Currency)}
        className="h-11 rounded-xl border border-border bg-background px-3 text-[17px] font-semibold disabled:opacity-50"
      >
        {CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </div>
  );
}
