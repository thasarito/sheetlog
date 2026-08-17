# Transaction-List Base-Currency Subline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quiet historical base-currency approximation beneath foreign recorded amounts in Home Recent, the full Transactions drawer, and the Analytics drawer.

**Architecture:** A new pure module owns bounded rate requests, base-to-quote conversion, row display states, and formatting. A thin TanStack Query hook supplies those states to Recent and full history, while Analytics extends its existing rate request and summary map so its rows reuse the exact rate data already powering analytics.

**Tech Stack:** React 18, TypeScript, TanStack Query, date-fns, Vitest, Testing Library, Playwright, Tailwind CSS.

---

## File Map

- Create `src/components/TransactionFlow/transactionBaseAmounts.ts` for pure request construction,
  historical conversion, row state, and visible/spoken formatting.
- Create `src/components/TransactionFlow/transactionBaseAmounts.test.ts` for pure behavior.
- Create `src/components/TransactionFlow/useTransactionBaseAmounts.ts` for the list-level TanStack
  Query adapter.
- Create `src/components/TransactionFlow/useTransactionBaseAmounts.test.tsx` for hook wiring and
  loading/ready state.
- Modify `src/components/TransactionFlow/TransactionHistoryItems.tsx` to render the shared quiet
  subline and include accessible conversion text.
- Modify `src/components/TransactionFlow/TransactionHistoryItems.test.tsx` for ready, loading,
  unavailable, sign, and same-currency row behavior.
- Modify `src/components/TransactionFlow/TopDashboard.tsx` and its test to convert Home Recent rows.
- Modify `src/components/TransactionFlow/HomeDashboardCarousel.tsx` and
  `src/components/LandingDemo/TransactionFlowDemo.tsx` to provide the base currency explicitly.
- Modify `src/components/TransactionFlow/TransactionHistoryDrawer.tsx` and its test to convert the
  complete record set independently of search filtering.
- Modify `src/components/TransactionFlow/index.tsx` to provide the selected base currency to the
  full Transactions drawer.
- Modify `src/components/TransactionFlow/analytics.ts` and its test to include display-only transfer
  conversions without making a missing transfer rate block analytics.
- Modify `src/components/TransactionFlow/AnalyticsDrawer.tsx` and its test to render summary-owned
  conversion states.
- Modify `e2e/home-carousel.spec.ts` to verify the approximation across all three mobile surfaces.

### Task 1: Pure Base-Amount Model and Query Adapter

**Files:**
- Create: `src/components/TransactionFlow/transactionBaseAmounts.test.ts`
- Create: `src/components/TransactionFlow/transactionBaseAmounts.ts`
- Create: `src/components/TransactionFlow/useTransactionBaseAmounts.test.tsx`
- Create: `src/components/TransactionFlow/useTransactionBaseAmounts.ts`

- [ ] **Step 1: Write failing pure-model tests**

Create `transactionBaseAmounts.test.ts` with a local transaction factory and assertions that pin the
request range, division rule, preceding-rate lookup, missing rows, same-currency rows, and formatting:

```ts
import { describe, expect, it } from 'vitest';
import type { ExchangeRateRecord, TransactionRecord } from '../../lib/types';
import {
  buildTransactionBaseAmountStates,
  buildTransactionBaseAmounts,
  formatTransactionBaseAmount,
  getTransactionBaseAmountAccessibleText,
  getTransactionBaseAmountRateRequest,
} from './transactionBaseAmounts';

function transaction(id: string, overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id,
    type: 'expense',
    amount: 3,
    currency: 'USD',
    account: 'Wallet',
    for: 'Me',
    category: id,
    date: '2026-08-15T12:00:00',
    status: 'synced',
    createdAt: '2026-08-15T12:00:00',
    updatedAt: '2026-08-15T12:00:00',
    ...overrides,
  };
}

const rates: ExchangeRateRecord[] = [
  {
    id: 'THB:USD:2026-08-14',
    base: 'THB',
    quote: 'USD',
    date: '2026-08-14',
    rate: 0.03,
    fetchedAt: '2026-08-17T00:00:00.000Z',
  },
];

describe('transaction base amounts', () => {
  it('builds one deduplicated request with a seven-day lookback', () => {
    expect(
      getTransactionBaseAmountRateRequest(
        [
          transaction('usd-new'),
          transaction('usd-old', { date: '2026-08-10T09:00:00' }),
          transaction('eur', { currency: 'EUR', date: '2026-08-12T09:00:00' }),
          transaction('base', { currency: 'THB' }),
          transaction('invalid', { currency: 'GBP', date: 'invalid' }),
        ],
        'THB',
      ),
    ).toEqual({
      base: 'THB',
      quotes: ['EUR', 'USD'],
      from: '2026-08-03',
      to: '2026-08-15',
    });
  });

  it('returns no request when no valid foreign date needs a rate', () => {
    expect(
      getTransactionBaseAmountRateRequest(
        [transaction('base', { currency: 'THB' }), transaction('bad', { date: 'bad' })],
        'THB',
      ),
    ).toBeNull();
  });

  it('divides by the closest prior base-to-quote rate without mutating rows', () => {
    const usd = transaction('usd');
    const base = transaction('base', { amount: 25, currency: 'THB' });
    const amounts = buildTransactionBaseAmounts([usd, base], 'THB', rates);

    expect(amounts).toEqual({ usd: 100, base: 25 });
    expect(usd).toMatchObject({ amount: 3, currency: 'USD' });
  });

  it('separates loading, ready, unavailable, and same-currency states', () => {
    const rows = [
      transaction('ready'),
      transaction('missing', { currency: 'EUR' }),
      transaction('base', { currency: 'THB' }),
    ];

    expect(buildTransactionBaseAmountStates(rows, 'THB', {}, true)).toEqual({
      ready: { status: 'loading', currency: 'THB' },
      missing: { status: 'loading', currency: 'THB' },
    });
    expect(buildTransactionBaseAmountStates(rows, 'THB', { ready: 100, base: 3 }, false)).toEqual({
      ready: { status: 'ready', currency: 'THB', amount: 100 },
      missing: { status: 'unavailable', currency: 'THB' },
    });
  });

  it('formats quiet visible and explicit spoken values', () => {
    const expense = transaction('expense');
    const income = transaction('income', { type: 'income' });
    const ready = { status: 'ready', currency: 'THB', amount: 100 } as const;
    const unavailable = { status: 'unavailable', currency: 'THB' } as const;

    expect(formatTransactionBaseAmount(expense, ready)).toBe('≈ −฿100.00');
    expect(formatTransactionBaseAmount(income, ready)).toBe('≈ +฿100.00');
    expect(formatTransactionBaseAmount(expense, unavailable)).toBe('≈ ฿—');
    expect(getTransactionBaseAmountAccessibleText(expense, ready)).toBe(
      'approximately minus 100.00 THB',
    );
    expect(getTransactionBaseAmountAccessibleText(expense, unavailable)).toBe(
      'base amount unavailable in THB',
    );
  });
});
```

- [ ] **Step 2: Run the pure-model test and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/transactionBaseAmounts.test.ts
```

Expected: FAIL because `transactionBaseAmounts.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Create `transactionBaseAmounts.ts` with these exported contracts and behavior:

```ts
import { format, parseISO, subDays } from 'date-fns';
import { tryParseDate } from '../../lib/date-utils';
import type { ExchangeRateRecord, TransactionRecord } from '../../lib/types';
import { findHistoricalQuoteRate, type HistoricalRateRequest } from './exchangeRates';

export type TransactionBaseAmountState =
  | { status: 'loading'; currency: string }
  | { status: 'ready'; currency: string; amount: number }
  | { status: 'unavailable'; currency: string };

function normalizedCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function transactionDateKey(transaction: TransactionRecord): string | null {
  const date = tryParseDate(transaction.date);
  return date ? format(date, 'yyyy-MM-dd') : null;
}

function currencyPrefix(currency: string): string {
  if (currency === 'THB') return '฿';
  if (currency === 'USD') return '$';
  return `${currency} `;
}

export function getTransactionBaseAmountRateRequest(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
): HistoricalRateRequest | null {
  const base = normalizedCurrency(baseCurrency);
  const quotes = new Set<string>();
  const dates: string[] = [];

  for (const transaction of transactions) {
    const quote = normalizedCurrency(transaction.currency);
    if (quote === base) continue;
    const date = transactionDateKey(transaction);
    if (!date) continue;
    quotes.add(quote);
    dates.push(date);
  }

  if (quotes.size === 0 || dates.length === 0) return null;
  dates.sort();
  return {
    base,
    quotes: [...quotes].sort(),
    from: format(subDays(parseISO(dates[0]), 7), 'yyyy-MM-dd'),
    to: dates.at(-1) as string,
  };
}

export function buildTransactionBaseAmounts(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  rates: readonly ExchangeRateRecord[],
): Record<string, number> {
  const base = normalizedCurrency(baseCurrency);
  const scopedRates = rates.filter((rate) => rate.base === base);
  const amounts: Record<string, number> = {};

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount)) continue;
    const quote = normalizedCurrency(transaction.currency);
    if (quote === base) {
      amounts[transaction.id] = amount;
      continue;
    }
    const date = transactionDateKey(transaction);
    if (!date) continue;
    const rate = findHistoricalQuoteRate([...scopedRates], quote, date);
    if (rate !== null) amounts[transaction.id] = amount / rate;
  }
  return amounts;
}

export function buildTransactionBaseAmountStates(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  amounts: Readonly<Record<string, number>>,
  isLoading: boolean,
): Record<string, TransactionBaseAmountState> {
  const base = normalizedCurrency(baseCurrency);
  return Object.fromEntries(
    transactions.flatMap((transaction) => {
      if (normalizedCurrency(transaction.currency) === base) return [];
      if (isLoading) {
        return [[transaction.id, { status: 'loading', currency: base } as const]];
      }
      return Object.hasOwn(amounts, transaction.id)
        ? [[transaction.id, { status: 'ready', currency: base, amount: amounts[transaction.id] } as const]]
        : [[transaction.id, { status: 'unavailable', currency: base } as const]];
    }),
  );
}

export function formatTransactionBaseAmount(
  transaction: TransactionRecord,
  state: Exclude<TransactionBaseAmountState, { status: 'loading' }>,
): string {
  const prefix = currencyPrefix(state.currency);
  if (state.status === 'unavailable') return `≈ ${prefix}—`;
  const sign = transaction.type === 'expense' ? '−' : '+';
  const amount = Math.abs(state.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `≈ ${sign}${prefix}${amount}`;
}

export function getTransactionBaseAmountAccessibleText(
  transaction: TransactionRecord,
  state: TransactionBaseAmountState,
): string | null {
  if (state.status === 'loading') return null;
  if (state.status === 'unavailable') return `base amount unavailable in ${state.currency}`;
  const sign = transaction.type === 'expense' ? 'minus' : 'plus';
  const amount = Math.abs(state.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `approximately ${sign} ${amount} ${state.currency}`;
}
```

- [ ] **Step 4: Run the pure-model test and confirm GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write failing hook tests**

Create `useTransactionBaseAmounts.test.tsx`, mock `useHistoricalRatesQuery`, and use `renderHook`
to prove that the hook sends the bounded request through TanStack Query, returns loading states before
data, returns ready states from cached/fetched data, and forwards refresh state:

```tsx
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { useHistoricalRatesQuery } from './exchangeRateQueries';
import { useTransactionBaseAmounts } from './useTransactionBaseAmounts';

vi.mock('./exchangeRateQueries', () => ({ useHistoricalRatesQuery: vi.fn() }));

const row = {
  id: 'usd', type: 'expense', amount: 3, currency: 'USD', account: 'Wallet', for: 'Me',
  category: 'Coffee', date: '2026-08-15T12:00:00', status: 'synced',
  createdAt: '2026-08-15T12:00:00', updatedAt: '2026-08-15T12:00:00',
} satisfies TransactionRecord;
const refetch = vi.fn();

beforeEach(() => {
  vi.mocked(useHistoricalRatesQuery).mockReset();
});

describe('useTransactionBaseAmounts', () => {
  it('returns loading state while the list-level rate query is pending', () => {
    vi.mocked(useHistoricalRatesQuery).mockReturnValue({
      data: undefined, error: null, isFetching: true, refetch,
    } as ReturnType<typeof useHistoricalRatesQuery>);
    const { result } = renderHook(() => useTransactionBaseAmounts([row], 'THB', true));
    expect(useHistoricalRatesQuery).toHaveBeenCalledWith(
      { base: 'THB', quotes: ['USD'], from: '2026-08-08', to: '2026-08-15' },
      true,
    );
    expect(result.current.states.usd).toEqual({ status: 'loading', currency: 'THB' });
    expect(result.current.isRefreshing).toBe(true);
  });

  it('returns ready state from resolved historical rates', () => {
    vi.mocked(useHistoricalRatesQuery).mockReturnValue({
      data: {
        rates: [{
          id: 'THB:USD:2026-08-15', base: 'THB', quote: 'USD', date: '2026-08-15',
          rate: 0.03, fetchedAt: '2026-08-17T00:00:00.000Z',
        }],
        refreshFailed: false,
      },
      error: null,
      isFetching: false,
      refetch,
    } as ReturnType<typeof useHistoricalRatesQuery>);
    const { result } = renderHook(() => useTransactionBaseAmounts([row], 'THB', true));
    expect(result.current.states.usd).toEqual({ status: 'ready', currency: 'THB', amount: 100 });
    expect(result.current.refetch).toBe(refetch);
  });

  it('rekeys and reverses which row needs a subline when base currency changes', () => {
    vi.mocked(useHistoricalRatesQuery).mockReturnValue({
      data: { rates: [], refreshFailed: false }, error: null, isFetching: false, refetch,
    } as ReturnType<typeof useHistoricalRatesQuery>);
    const baseRow = { ...row, id: 'thb', amount: 100, currency: 'THB' };
    const rendered = renderHook(
      ({ baseCurrency }) => useTransactionBaseAmounts([row, baseRow], baseCurrency, true),
      { initialProps: { baseCurrency: 'THB' } },
    );
    expect(rendered.result.current.states).toHaveProperty('usd');
    expect(rendered.result.current.states).not.toHaveProperty('thb');

    rendered.rerender({ baseCurrency: 'USD' });
    expect(rendered.result.current.states).not.toHaveProperty('usd');
    expect(rendered.result.current.states).toHaveProperty('thb');
    expect(useHistoricalRatesQuery).toHaveBeenLastCalledWith(
      { base: 'USD', quotes: ['THB'], from: '2026-08-08', to: '2026-08-15' },
      true,
    );
  });
});
```

- [ ] **Step 6: Run the hook test and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/useTransactionBaseAmounts.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 7: Implement the TanStack Query adapter**

Create `useTransactionBaseAmounts.ts`:

```ts
import { useMemo } from 'react';
import type { TransactionRecord } from '../../lib/types';
import { useHistoricalRatesQuery } from './exchangeRateQueries';
import {
  buildTransactionBaseAmountStates,
  buildTransactionBaseAmounts,
  getTransactionBaseAmountRateRequest,
} from './transactionBaseAmounts';

export function useTransactionBaseAmounts(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  enabled: boolean,
) {
  const request = useMemo(
    () => getTransactionBaseAmountRateRequest(transactions, baseCurrency),
    [baseCurrency, transactions],
  );
  const query = useHistoricalRatesQuery(request, enabled && request !== null);
  const amounts = useMemo(
    () => buildTransactionBaseAmounts(transactions, baseCurrency, query.data?.rates ?? []),
    [baseCurrency, query.data?.rates, transactions],
  );
  const isLoading = enabled && request !== null && query.data === undefined && !query.error;
  const states = useMemo(
    () => buildTransactionBaseAmountStates(transactions, baseCurrency, amounts, isLoading),
    [amounts, baseCurrency, isLoading, transactions],
  );

  return { states, refetch: query.refetch, isRefreshing: query.isFetching };
}
```

- [ ] **Step 8: Run both new suites and commit**

Run:

```bash
npx vitest run src/components/TransactionFlow/transactionBaseAmounts.test.ts src/components/TransactionFlow/useTransactionBaseAmounts.test.tsx
git add src/components/TransactionFlow/transactionBaseAmounts.ts src/components/TransactionFlow/transactionBaseAmounts.test.ts src/components/TransactionFlow/useTransactionBaseAmounts.ts src/components/TransactionFlow/useTransactionBaseAmounts.test.tsx
git commit -m "feat: model transaction base amounts"
```

Expected: both suites PASS and the commit succeeds.

### Task 2: Shared Transaction-Row Subline

**Files:**
- Modify: `src/components/TransactionFlow/TransactionHistoryItems.test.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryItems.tsx`

- [ ] **Step 1: Write failing row presentation tests**

Extend `TransactionHistoryItems.test.tsx` with one test that renders base, ready foreign, loading
foreign, unavailable foreign, and foreign income rows. Pass the new `baseAmount` prop and assert:

```tsx
expect(screen.getByText('≈ −฿100.00')).toHaveClass('text-muted-foreground');
expect(screen.getByText('≈ +฿100.00')).toBeInTheDocument();
expect(screen.getByText('≈ ฿—')).toBeInTheDocument();
expect(screen.getByTestId('base-currency-amount-loading')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /approximately minus 100\.00 THB/ })).toBeEnabled();
expect(screen.getByRole('button', { name: /base amount unavailable in THB/ })).toBeEnabled();
expect(screen.getByText('−฿10.00').closest('button')).not.toHaveTextContent('≈');
```

- [ ] **Step 2: Run the row suite and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryItems.test.tsx
```

Expected: FAIL because `TransactionHistoryRow` has no `baseAmount` prop or subline.

- [ ] **Step 3: Add the reusable subline component and row prop**

In `TransactionHistoryItems.tsx`, import `Skeleton` and the base-amount helpers/type. Add this
presentational component:

```tsx
export function TransactionBaseAmountLine({
  transaction,
  state,
}: {
  transaction: TransactionRecord;
  state?: TransactionBaseAmountState;
}) {
  if (!state) return null;
  if (state.status === 'loading') {
    return (
      <Skeleton
        aria-hidden="true"
        data-testid="base-currency-amount-loading"
        className="mt-0.5 h-3 w-14 self-end"
      />
    );
  }
  const accessibleText = getTransactionBaseAmountAccessibleText(transaction, state);
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="base-currency-amount"
        className="text-[11px] font-normal leading-tight text-muted-foreground"
      >
        {formatTransactionBaseAmount(transaction, state)}
      </span>
      {accessibleText ? <span className="sr-only">{accessibleText}</span> : null}
    </>
  );
}
```

Add `baseAmount?: TransactionBaseAmountState` to `TransactionHistoryRow`. Append the spoken helper
text to its explicit `accessibleLabel`, and replace the single amount span with:

```tsx
<span className="flex flex-col items-end whitespace-nowrap tabular-nums">
  <span
    className={cn(
      'font-semibold',
      transaction.type === 'income'
        ? 'text-emerald-500'
        : transaction.type === 'transfer'
          ? 'text-blue-500'
          : 'text-foreground',
    )}
  >
    {amount}
  </span>
  <TransactionBaseAmountLine transaction={transaction} state={baseAmount} />
</span>
```

- [ ] **Step 4: Run the row suite and commit**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryItems.test.tsx
git add src/components/TransactionFlow/TransactionHistoryItems.tsx src/components/TransactionFlow/TransactionHistoryItems.test.tsx
git commit -m "feat: render quiet base amount subline"
```

Expected: PASS and the commit succeeds.

### Task 3: Home Recent Integration

**Files:**
- Modify: `src/components/TransactionFlow/TopDashboard.test.tsx`
- Modify: `src/components/TransactionFlow/TopDashboard.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/LandingDemo/TransactionFlowDemo.tsx`

- [ ] **Step 1: Write a failing Recent integration test**

Extend the hoisted TopDashboard test state with `baseAmountStates`, mock
`useTransactionBaseAmounts`, reset the map in `beforeEach`, and make `renderDashboard` pass
`baseCurrency="THB"`. Add:

```tsx
it('shows a quiet base-currency approximation only for a foreign row', () => {
  mocks.recent = [
    transaction('foreign', { amount: 3, currency: 'USD', category: 'Foreign coffee' }),
    transaction('base', { amount: 40, currency: 'THB', category: 'Local lunch' }),
  ];
  mocks.baseAmountStates = {
    foreign: { status: 'ready', currency: 'THB', amount: 100 },
  };

  renderDashboard();

  expect(screen.getByText('≈ −฿100.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Foreign coffee.*approximately minus 100\.00 THB/i }))
    .toBeEnabled();
  expect(screen.getByText('Local lunch').closest('button')).not.toHaveTextContent('≈');
});
```

- [ ] **Step 2: Run the Recent suite and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TopDashboard.test.tsx
```

Expected: FAIL because TopDashboard neither accepts `baseCurrency` nor renders the state.

- [ ] **Step 3: Wire the list-level query and shared line into Recent**

Add required `baseCurrency: string` to `TopDashboardProps`, call:

```ts
const baseAmounts = useTransactionBaseAmounts(transactions, baseCurrency, true);
```

Wrap the existing recorded amount span in `flex flex-col items-end`, leave its current content and
styling unchanged, and render:

```tsx
<TransactionBaseAmountLine
  transaction={t}
  state={baseAmounts.states[t.id]}
/>
```

Pass `baseCurrency` from `HomeDashboardCarousel` and pass `baseCurrency="THB"` from the landing demo.

- [ ] **Step 4: Run the Recent and carousel component suites and commit**

Run:

```bash
npx vitest run src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
git add src/components/TransactionFlow/TopDashboard.tsx src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/LandingDemo/TransactionFlowDemo.tsx
git commit -m "feat: show base amounts in recent transactions"
```

Expected: both suites PASS and the commit succeeds.

### Task 4: Full Transactions Drawer Integration

**Files:**
- Modify: `src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryDrawer.tsx`
- Modify: `src/components/TransactionFlow/index.tsx`

- [ ] **Step 1: Write failing full-history tests**

Mock `useTransactionBaseAmounts` with a hoisted `baseAmountStates` map and `rateRefetch` spy. Pass
`baseCurrency="THB"` in every drawer render. Add one foreign row and assert its ready subline. Then
type a search and verify every hook call still receives the complete `mocks.history.records`, not
the filtered records. Add a refresh assertion that the header Refresh invokes both
`history.refresh` and `rateRefetch`.

```tsx
expect(screen.getByText('≈ −฿100.00')).toBeInTheDocument();
await user.type(screen.getByRole('searchbox', { name: 'Search transaction history' }), 'foreign');
expect(useTransactionBaseAmounts).toHaveBeenLastCalledWith(
  mocks.history.records,
  'THB',
  true,
);
await user.click(screen.getByRole('button', { name: 'Refresh transaction history' }));
expect(mocks.history.refresh).toHaveBeenCalledTimes(1);
expect(mocks.rateRefetch).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the drawer suite and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx
```

Expected: FAIL because the drawer has no base-currency prop or conversion hook.

- [ ] **Step 3: Pass conversion state through the virtual list**

Add required `baseCurrency: string` to `TransactionHistoryDrawerProps`. Call the hook with
`history.records` and `open`, pass its `states` into `TransactionHistoryVirtualList`, and add this
prop there:

```ts
baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>;
```

Pass `baseAmount={baseAmountStates[item.transaction.id]}` to each `TransactionHistoryRow`. Combine
refresh activity and behavior without adding a nested row action:

```tsx
const isRefreshing = history.isRefreshing || baseAmounts.isRefreshing;

onClick={() => {
  void history.refresh();
  void baseAmounts.refetch();
}}
```

Use `isRefreshing` for the header button's disabled/spinning state. In `TransactionFlow/index.tsx`,
pass `baseCurrency={onboarding.analyticsBaseCurrency}` to the drawer.

- [ ] **Step 4: Run the drawer suite and commit**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx src/components/TransactionFlow/TransactionHistoryItems.test.tsx
git add src/components/TransactionFlow/TransactionHistoryDrawer.tsx src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx src/components/TransactionFlow/index.tsx
git commit -m "feat: show base amounts in transaction history"
```

Expected: both suites PASS and the commit succeeds.

### Task 5: Analytics Drawer Reuse Without a Duplicate Query

**Files:**
- Modify: `src/components/TransactionFlow/analytics.test.ts`
- Modify: `src/components/TransactionFlow/analytics.ts`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`

- [ ] **Step 1: Write failing analytics conversion tests**

In `analytics.test.ts`, add a current-period USD transfer. Assert that
`getAnalyticsRateRequest` includes USD even though transfers do not affect totals. Build once with no
rate and assert a ready summary with no transfer key, then build with a THB/USD rate and assert the
transfer's base amount is present:

```ts
expect(request?.quotes).toContain('USD');
expect(withoutTransferRate.status).toBe('ready');
if (withoutTransferRate.status === 'ready') {
  expect(withoutTransferRate.summary.convertedAmounts).not.toHaveProperty('foreign-transfer');
}
expect(withTransferRate.status).toBe('ready');
if (withTransferRate.status === 'ready') {
  expect(withTransferRate.summary.convertedAmounts['foreign-transfer']).toBe(100);
  expect(withTransferRate.summary.expenseTotal).toBe(0);
}
```

- [ ] **Step 2: Run the analytics model suite and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts
```

Expected: FAIL because current transfer currencies are absent from the request/map.

- [ ] **Step 3: Extend only the display conversion population**

Import `buildTransactionBaseAmounts` into `analytics.ts`. In `getAnalyticsRateRequest`, construct
quotes from every current row plus comparison-period expenses:

```ts
const quotes = [
  ...currentRows,
  ...comparisonRows.filter((row) => row.type === 'expense'),
]
  .map((row) => row.currency)
  .filter((currency) => currency !== baseCurrency);
```

Keep the existing `contributingRows` missing-rate loop so a transfer-only miss cannot block the
summary. After that loop succeeds, build a lookup for all current rows and contributing comparison
rows:

```ts
const allConvertedAmounts = buildTransactionBaseAmounts(
  [...currentRows, ...comparisonRows.filter((row) => row.type === 'expense')],
  baseCurrency,
  scopedRates,
);
const convertedAmount: ConvertedAmount = (row) => allConvertedAmounts[row.id] ?? 0;
```

When returning `summary.convertedAmounts`, include only scoped current rows that own an entry:

```ts
const convertedAmounts = Object.fromEntries(
  scopedCurrentRows.flatMap((row) =>
    Object.hasOwn(allConvertedAmounts, row.id)
      ? [[row.id, allConvertedAmounts[row.id]]]
      : [],
  ),
);
```

- [ ] **Step 4: Run analytics model tests and confirm GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write a failing Analytics drawer row test**

In `AnalyticsDrawer.test.tsx`, build a ready summary containing a foreign expense and a resolved
`convertedAmounts` value. Assert the quiet line and accessible name render. Add a foreign transfer
without a mapped value and assert `≈ ฿—` plus `base amount unavailable in THB`.

- [ ] **Step 6: Run the Analytics drawer suite and confirm RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because Analytics rows do not receive base-amount states.

- [ ] **Step 7: Derive presentational states from the retained summary**

Import `buildTransactionBaseAmountStates`. Derive states from `filteredTransactions`, the retained
summary currency, and `summary.convertedAmounts`:

```ts
const transactionBaseCurrency = summary?.currency ?? baseCurrency;
const transactionBaseAmountStates = useMemo(
  () =>
    buildTransactionBaseAmountStates(
      filteredTransactions,
      transactionBaseCurrency,
      summary?.convertedAmounts ?? {},
      false,
    ),
  [filteredTransactions, summary?.convertedAmounts, transactionBaseCurrency],
);
```

Pass `baseAmount={transactionBaseAmountStates[item.transaction.id]}` into every analytics
`TransactionHistoryRow`. Do not add another query hook.

- [ ] **Step 8: Run focused analytics suites and commit**

Run:

```bash
npx vitest run src/components/TransactionFlow/analytics.test.ts src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "feat: show base amounts in analytics transactions"
```

Expected: all three suites PASS and the commit succeeds.

### Task 6: Mobile Coverage, Full Verification, and Direct Delivery

**Files:**
- Modify: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Add cross-surface mobile assertions**

The fixture already seeds a `$3.00` USD coffee row and intercepts Frankfurter with `0.03`. Add these
assertions to the existing all-surfaces test:

```ts
await expect(transactionsSlide.getByText('≈ −฿100.00')).toBeVisible();
await expect(
  analyticsDialog.getByRole('button', {
    name: /Coffee & Snacks.*approximately minus 100\.00 THB/,
  }),
).toBeVisible();
await expect(transactionsDialog.getByText('≈ −฿100.00')).toBeVisible();
```

Clear the history search before its assertion so the USD coffee remains rendered. Keep the existing
mobile geometry, focus restoration, grouping, and no-shadow assertions intact. Inspect the foreign
row and the following row bounding boxes in the full drawer and assert the first row's bottom is no
greater than the next row's top; this guards virtualized remeasurement after the subline resolves:

```ts
const fullHistoryRows = transactionsDialog.getByTestId('history-transaction-row');
const foreignIndex = await fullHistoryRows.evaluateAll((rows) =>
  rows.findIndex((row) => row.textContent?.includes('$3.00')),
);
expect(foreignIndex).toBeGreaterThanOrEqual(0);
const foreignBox = await fullHistoryRows.nth(foreignIndex).boundingBox();
const followingBox = await fullHistoryRows.nth(foreignIndex + 1).boundingBox();
expect(foreignBox).not.toBeNull();
expect(followingBox).not.toBeNull();
expect((foreignBox?.y ?? 0) + (foreignBox?.height ?? 0)).toBeLessThanOrEqual(followingBox?.y ?? 0);
```

- [ ] **Step 2: Run the mobile all-surfaces test**

Run:

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0
```

Expected: PASS.

- [ ] **Step 3: Commit mobile coverage**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover transaction base amount sublines"
```

- [ ] **Step 4: Run repository verification**

Run each command and require exit code 0:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome" --retries=0
git diff --check origin/main...HEAD
git status --short
```

Expected: lint, typecheck, all Vitest suites, production build, and mobile Playwright PASS; diff
check is clean; status has no uncommitted product changes. The untracked `.superpowers/` visual
preview directory must not be staged or committed.

- [ ] **Step 5: Rebase onto the latest remote main and re-verify if needed**

```bash
git fetch origin main
git rebase origin/main
```

If the rebase changes `HEAD`, rerun all Step 4 verification commands. Resolve only feature-owned
conflicts and preserve upstream changes.

- [ ] **Step 6: Push the verified commit directly to main**

```bash
git push origin HEAD:main
```

Expected: a fast-forward update succeeds. Never force-push.

- [ ] **Step 7: Confirm GitHub and CI with `gh`**

```bash
gh api repos/thasarito/sheetlog/commits/main --jq '.sha + " " + .commit.message'
gh run list --branch main --limit 10 --json databaseId,headSha,status,conclusion,workflowName,url
gh run watch <matching-run-id> --exit-status
```

Select the run whose `headSha` equals the pushed commit. Expected: GitHub reports the pushed SHA and
the matching required main-branch workflow concludes successfully. If no workflow is configured for
the direct push, verify the commit status/check-runs through `gh api` and report that CI did not
create a run rather than claiming it passed.
