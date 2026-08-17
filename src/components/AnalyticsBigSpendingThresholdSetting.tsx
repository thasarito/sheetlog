import { BadgeDollarSign } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Currency } from '../lib/currencies';

type Props = {
  currency: Currency;
  value: number | null;
  disabled: boolean;
  onCommit: (amount: number | null) => void;
  onInvalid: () => void;
};

function displayValue(value: number | null): string {
  return value === null ? '' : String(value);
}

export function AnalyticsBigSpendingThresholdSetting({
  currency,
  value,
  disabled,
  onCommit,
  onInvalid,
}: Props) {
  const [draft, setDraft] = useState(() => displayValue(value));
  const cancelBlurRef = useRef(false);

  useEffect(() => setDraft(displayValue(value)), [value]);

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      if (value !== null) onCommit(null);
      return;
    }
    const amount = Number(trimmed);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDraft(displayValue(value));
      onInvalid();
      return;
    }
    setDraft(String(amount));
    if (amount !== value) onCommit(amount);
  };

  return (
    <div className="flex min-h-14 items-center gap-3 bg-card px-4 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#FF9500] text-white">
        <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
      </div>
      <label htmlFor="analytics-big-spending-threshold" className="min-w-0 flex-1 text-[17px]">
        Big spending cutoff
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-muted-foreground">{currency}</span>
        <input
          id="analytics-big-spending-threshold"
          type="text"
          inputMode="decimal"
          aria-label={`Big spending cutoff in ${currency}`}
          placeholder="Not set"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelBlurRef.current = true;
              setDraft(displayValue(value));
              event.currentTarget.blur();
            }
          }}
          className="h-11 w-24 rounded-xl border border-border bg-background px-3 text-right text-[17px] font-semibold tabular-nums disabled:opacity-50"
        />
      </div>
    </div>
  );
}
