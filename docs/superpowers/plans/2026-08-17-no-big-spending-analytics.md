# No Big Spending Analytics Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an icon-only, drawer-local analytics mode that excludes expenses at or above one Settings-managed cutoff expressed in the analytics base currency.

**Architecture:** Extend the existing synchronized onboarding setting contract with one timestamped, currency-stamped cutoff. Keep exclusion and converted-amount comparison in the pure analytics builder, produce separate compact and drawer summaries in `HomeDashboardCarousel`, and keep the pressed state controlled by the carousel so closing the drawer resets it.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Dexie, Google Sheets v4, Lucide React, Tailwind CSS.

---

## File Structure

- `src/lib/types.ts`: define the portable threshold setting and add it to onboarding state.
- `src/lib/settings.ts`: normalize legacy/local threshold state and provide a null default.
- `src/lib/onboarding.ts`: reconcile the threshold by timestamp with the remote Sheet setting.
- `src/hooks/useOnboardingQuery.ts`: include threshold changes in TanStack-backed Sheet writes.
- `src/lib/google.ts`: parse and update the recognized Google Sheet setting row.
- `src/lib/mock/mockStorage.ts`: persist the setting in mock-mode local storage.
- `src/lib/mock/mockGoogle.ts`: expose the setting through mock onboarding reads and writes.
- `src/components/AnalyticsBigSpendingThresholdSetting.tsx`: own cutoff draft, validation, commit, clear, and Escape behavior.
- `src/components/SettingsDrawer.tsx`: render the cutoff beneath base currency and clear it when base currency changes.
- `src/components/TransactionFlow/analytics.ts`: apply the optional threshold after conversion and return the excluded count.
- `src/components/TransactionFlow/AnalyticsDrawer.tsx`: render the single `BadgeDollarSign` toggle with accessible state.
- `src/components/TransactionFlow/HomeDashboardCarousel.tsx`: keep unfiltered compact analytics, build filtered drawer analytics, and reset mode on close.
- `src/components/TransactionFlow/index.tsx`: resolve the current-base cutoff and pass it with the toast callback.
- Existing colocated test files cover each modified boundary; one new component test covers the Settings input.

### Task 1: Model and reconcile the durable cutoff

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/settings.test.ts`
- Modify: `src/lib/onboarding.ts`
- Modify: `src/lib/onboarding.test.ts`

- [ ] **Step 1: Write failing normalization and reconciliation tests**

Add these cases to `src/lib/settings.test.ts`:

```ts
it('defaults legacy records to no big spending cutoff', () => {
  const state = normalizeOnboardingState({});
  expect(state.analyticsBigSpendingThreshold).toBeNull();
});

it('keeps a valid timestamped and currency-stamped cutoff', () => {
  const state = normalizeOnboardingState({
    analyticsBigSpendingThreshold: {
      amount: 10_000,
      currency: 'THB',
      updatedAt: '2026-08-17T13:00:00.000Z',
    },
  });
  expect(state.analyticsBigSpendingThreshold).toEqual({
    amount: 10_000,
    currency: 'THB',
    updatedAt: '2026-08-17T13:00:00.000Z',
  });
});

it('rejects malformed cutoff values', () => {
  expect(
    normalizeOnboardingState({
      analyticsBigSpendingThreshold: {
        amount: -1,
        currency: 'THB',
        updatedAt: 'not-a-date',
      },
    }).analyticsBigSpendingThreshold,
  ).toBeNull();
});
```

Add newer-remote, newer-local, and timestamped-clear cases to `src/lib/onboarding.test.ts`:

```ts
it('hydrates a newer remote big spending cutoff', () => {
  const current = {
    ...getDefaultOnboardingState(),
    analyticsBigSpendingThreshold: {
      amount: 5_000,
      currency: 'THB' as const,
      updatedAt: '2026-08-16T10:00:00.000Z',
    },
  };
  const remote = {
    amount: 10_000,
    currency: 'THB' as const,
    updatedAt: '2026-08-17T10:00:00.000Z',
  };
  const result = mergeOnboardingState(current, {
    analyticsBigSpendingThreshold: remote,
  });
  expect(result.next.analyticsBigSpendingThreshold).toEqual(remote);
  expect(result.changed).toBe(true);
  expect(result.settingsNeedPush).toBe(false);
});

it('keeps a newer local cutoff and schedules it for push', () => {
  const local = {
    amount: 10_000,
    currency: 'THB' as const,
    updatedAt: '2026-08-17T10:00:00.000Z',
  };
  const result = mergeOnboardingState(
    { ...getDefaultOnboardingState(), analyticsBigSpendingThreshold: local },
    {
      analyticsBigSpendingThreshold: {
        amount: 5_000,
        currency: 'THB',
        updatedAt: '2026-08-16T10:00:00.000Z',
      },
    },
  );
  expect(result.next.analyticsBigSpendingThreshold).toEqual(local);
  expect(result.changed).toBe(false);
  expect(result.settingsNeedPush).toBe(true);
});

it('hydrates a timestamped remote clear', () => {
  const result = mergeOnboardingState(
    {
      ...getDefaultOnboardingState(),
      analyticsBigSpendingThreshold: {
        amount: 10_000,
        currency: 'THB',
        updatedAt: '2026-08-16T10:00:00.000Z',
      },
    },
    {
      analyticsBigSpendingThreshold: {
        amount: null,
        currency: 'THB',
        updatedAt: '2026-08-17T10:00:00.000Z',
      },
    },
  );
  expect(result.next.analyticsBigSpendingThreshold?.amount).toBeNull();
  expect(result.changed).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/lib/settings.test.ts src/lib/onboarding.test.ts
```

Expected: FAIL because `analyticsBigSpendingThreshold` is absent from the state and remote config.

- [ ] **Step 3: Add the setting type and local normalization**

Add to `src/lib/types.ts`:

```ts
export type AnalyticsBigSpendingThresholdSetting = {
  amount: number | null;
  currency: Currency;
  updatedAt: string;
};

export interface OnboardingState {
  // existing fields remain unchanged
  analyticsBigSpendingThreshold: AnalyticsBigSpendingThresholdSetting | null;
}
```

In `src/lib/settings.ts`, add the default and a strict normalizer:

```ts
const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  // existing defaults
  analyticsBigSpendingThreshold: null,
};

function normalizeAnalyticsBigSpendingThreshold(
  value: unknown,
): AnalyticsBigSpendingThresholdSetting | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Record<string, unknown>;
  const amount = parsed.amount;
  const updatedAt = parsed.updatedAt;
  if (
    !isCurrency(parsed.currency) ||
    !(
      amount === null ||
      (typeof amount === 'number' && Number.isFinite(amount) && amount > 0)
    ) ||
    typeof updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }
  return { amount, currency: parsed.currency, updatedAt };
}
```

Return it from `normalizeOnboardingState`:

```ts
analyticsBigSpendingThreshold: normalizeAnalyticsBigSpendingThreshold(
  parsed.analyticsBigSpendingThreshold,
),
```

- [ ] **Step 4: Reconcile the threshold beside base currency**

Extend `OnboardingSheetConfig` in `src/lib/onboarding.ts` and compare remote/local timestamps:

```ts
export type OnboardingSheetConfig = {
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
  analyticsBaseCurrency?: AnalyticsBaseCurrencySetting;
  analyticsBigSpendingThreshold?: AnalyticsBigSpendingThresholdSetting;
};

const remoteThreshold = config.analyticsBigSpendingThreshold;
const localThreshold = current.analyticsBigSpendingThreshold;
const remoteThresholdTime = remoteThreshold
  ? Date.parse(remoteThreshold.updatedAt)
  : Number.NaN;
const localThresholdTime = localThreshold
  ? Date.parse(localThreshold.updatedAt)
  : Number.NaN;

if (remoteThreshold && Number.isFinite(remoteThresholdTime)) {
  if (!Number.isFinite(localThresholdTime) || remoteThresholdTime > localThresholdTime) {
    next = { ...next, analyticsBigSpendingThreshold: remoteThreshold };
    changed = true;
  } else if (
    remoteThresholdTime < localThresholdTime ||
    (remoteThresholdTime === localThresholdTime &&
      JSON.stringify(remoteThreshold) !== JSON.stringify(localThreshold))
  ) {
    settingsNeedPush = true;
  }
} else if (localThreshold) {
  settingsNeedPush = true;
}
```

When no remote config exists, include the threshold in the push decision:

```ts
settingsNeedPush: Boolean(
  current.analyticsBaseCurrencyUpdatedAt || current.analyticsBigSpendingThreshold,
),
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/lib/settings.test.ts src/lib/onboarding.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit the setting model**

```bash
git add src/lib/types.ts src/lib/settings.ts src/lib/settings.test.ts src/lib/onboarding.ts src/lib/onboarding.test.ts
git commit -m "feat: model big spending analytics cutoff"
```

### Task 2: Synchronize the cutoff through Google Sheets and mock mode

**Files:**
- Modify: `src/lib/google.ts`
- Modify: `src/lib/googleSettings.test.ts`
- Modify: `src/hooks/useOnboardingQuery.ts`
- Modify: `src/lib/mock/mockStorage.ts`
- Modify: `src/lib/mock/mockGoogle.ts`

- [ ] **Step 1: Write failing Google Sheet parsing and update tests**

Extend `src/lib/googleSettings.test.ts` with:

```ts
it('reads a valid timestamped big spending cutoff', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const values = String(input).includes('/values/Settings!A2:C')
        ? [
            [
              'analyticsBigSpendingThreshold',
              JSON.stringify({ amount: 10_000, currency: 'THB' }),
              '2026-08-17T10:00:00.000Z',
            ],
          ]
        : [];
      return { ok: true, json: async () => ({ values }) };
    }),
  );
  const result = await readOnboardingConfig('token', 'sheet-id');
  expect(result?.analyticsBigSpendingThreshold).toEqual({
    amount: 10_000,
    currency: 'THB',
    updatedAt: '2026-08-17T10:00:00.000Z',
  });
});

it('writes a timestamped cutoff tombstone without replacing unknown rows', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('?fields=sheets(')) {
      return {
        ok: true,
        json: async () => ({ sheets: [{ properties: { sheetId: 4, title: 'Settings' } }] }),
      };
    }
    if (url.includes('/values/Settings!A2:C') && !init?.method) {
      return {
        ok: true,
        json: async () => ({
          values: [
            ['theme', 'dark', '2026-01-01T00:00:00.000Z'],
            [
              'analyticsBigSpendingThreshold',
              JSON.stringify({ amount: 10_000, currency: 'THB' }),
              '2026-08-16T00:00:00.000Z',
            ],
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);

  await writeOnboardingConfig('token', 'sheet-id', {
    analyticsBigSpendingThreshold: {
      amount: null,
      currency: 'USD',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/values/Settings!A3:C3?valueInputOption=RAW'),
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        values: [
          [
            'analyticsBigSpendingThreshold',
            JSON.stringify({ amount: null, currency: 'USD' }),
            '2026-08-17T00:00:00.000Z',
          ],
        ],
      }),
    }),
  );
});
```

- [ ] **Step 2: Run the Google settings test and verify RED**

Run:

```bash
npm test -- src/lib/googleSettings.test.ts
```

Expected: FAIL because the threshold key is not parsed or written.

- [ ] **Step 3: Parse and write the recognized setting row**

In `src/lib/google.ts`, add the key, type import, parser, and config fields:

```ts
const ANALYTICS_BIG_SPENDING_THRESHOLD_KEY = 'analyticsBigSpendingThreshold';

function parseAnalyticsBigSpendingThreshold(
  rows: string[][],
): AnalyticsBigSpendingThresholdSetting | null {
  const row = rows.find(
    (candidate) => candidate[0]?.trim() === ANALYTICS_BIG_SPENDING_THRESHOLD_KEY,
  );
  if (!row) return null;
  const updatedAt = row[2]?.trim();
  try {
    const value = JSON.parse(row[1] ?? '') as { amount?: unknown; currency?: unknown };
    if (
      !isCurrency(value.currency) ||
      !(
        value.amount === null ||
        (typeof value.amount === 'number' &&
          Number.isFinite(value.amount) &&
          value.amount > 0)
      ) ||
      typeof updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return null;
    }
    return { amount: value.amount, currency: value.currency, updatedAt };
  } catch {
    return null;
  }
}
```

Read it from the same Settings response and include it in the return object. Extend
`OnboardingConfigUpdates`, then update or append its row while preserving unknown rows:

```ts
if (!accounts && !categories && !analyticsBaseCurrency && !analyticsBigSpendingThreshold) {
  return null;
}

return {
  ...(accounts ? { accounts } : {}),
  ...(categories ? { categories } : {}),
  ...(analyticsBaseCurrency ? { analyticsBaseCurrency } : {}),
  ...(analyticsBigSpendingThreshold ? { analyticsBigSpendingThreshold } : {}),
};

if (
  !updates.accounts &&
  !updates.categories &&
  !updates.analyticsBaseCurrency &&
  !updates.analyticsBigSpendingThreshold
) {
  return;
}

if (updates.analyticsBigSpendingThreshold) {
  await ensureSettingsSheet(accessToken, spreadsheetId);
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SETTINGS_TAB}!A2:C`;
  const data = await fetchWithAuth<{ values?: string[][] }>(readUrl, accessToken);
  const rows = data.values ?? [];
  const existingIndex = rows.findIndex(
    (row) => row[0]?.trim() === ANALYTICS_BIG_SPENDING_THRESHOLD_KEY,
  );
  const setting = updates.analyticsBigSpendingThreshold;
  const values = [
    [
      ANALYTICS_BIG_SPENDING_THRESHOLD_KEY,
      JSON.stringify({ amount: setting.amount, currency: setting.currency }),
      setting.updatedAt,
    ],
  ];
  if (existingIndex >= 0) {
    const rowNumber = existingIndex + 2;
    const range = `${SETTINGS_TAB}!A${rowNumber}:C${rowNumber}`;
    await fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      accessToken,
      { method: 'PUT', body: JSON.stringify({ values }) },
    );
  } else {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SETTINGS_TAB}!A:C:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    await fetchWithAuth(url, accessToken, {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
  }
}
```

- [ ] **Step 4: Route the setting through the TanStack mutation**

In `src/hooks/useOnboardingQuery.ts`, extend `SheetUpdates`, `buildSheetUpdates`, the sync push, and
the mutation write guard:

```ts
type SheetUpdates = {
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
  analyticsBaseCurrency?: AnalyticsBaseCurrencySetting;
  analyticsBigSpendingThreshold?: AnalyticsBigSpendingThresholdSetting;
};

if ('analyticsBigSpendingThreshold' in updates && next.analyticsBigSpendingThreshold) {
  result.analyticsBigSpendingThreshold = next.analyticsBigSpendingThreshold;
}
```

When reconciliation schedules a push, include both timestamped settings that exist:

```ts
if (result.settingsNeedPush) {
  const settingsUpdates: SheetUpdates = {
    ...(result.next.analyticsBaseCurrencyUpdatedAt
      ? {
          analyticsBaseCurrency: {
            currency: result.next.analyticsBaseCurrency,
            updatedAt: result.next.analyticsBaseCurrencyUpdatedAt,
          },
        }
      : {}),
    ...(result.next.analyticsBigSpendingThreshold
      ? { analyticsBigSpendingThreshold: result.next.analyticsBigSpendingThreshold }
      : {}),
  };
  if (settingsUpdates.analyticsBaseCurrency || settingsUpdates.analyticsBigSpendingThreshold) {
    await writeOnboardingConfig(accessToken, sheetId, settingsUpdates);
  }
}
```

Include `sheetUpdates.analyticsBigSpendingThreshold` in the mutation's write guard.

- [ ] **Step 5: Mirror the setting in mock storage and mock Google**

Add a local-storage key plus get/set functions in `src/lib/mock/mockStorage.ts`:

```ts
const ANALYTICS_BIG_SPENDING_THRESHOLD_KEY =
  `${STORAGE_PREFIX}.analyticsBigSpendingThreshold`;

export function getMockAnalyticsBigSpendingThreshold():
  AnalyticsBigSpendingThresholdSetting | null {
  return getFromStorage<AnalyticsBigSpendingThresholdSetting | null>(
    ANALYTICS_BIG_SPENDING_THRESHOLD_KEY,
    null,
  );
}

export function setMockAnalyticsBigSpendingThreshold(
  setting: AnalyticsBigSpendingThresholdSetting,
): void {
  setToStorage(ANALYTICS_BIG_SPENDING_THRESHOLD_KEY, setting);
}
```

Include it in `MockSheetData`, `getMockSheetData`, `setMockSheetData`, and `clearMockData`. In
`src/lib/mock/mockGoogle.ts`, include it in the read result and persist it when present in write
updates.

- [ ] **Step 6: Run focused persistence tests and verify GREEN**

Run:

```bash
npm test -- src/lib/googleSettings.test.ts src/lib/settings.test.ts src/lib/onboarding.test.ts
```

Expected: all three files pass.

- [ ] **Step 7: Commit synchronized persistence**

```bash
git add src/lib/google.ts src/lib/googleSettings.test.ts src/hooks/useOnboardingQuery.ts src/lib/mock/mockStorage.ts src/lib/mock/mockGoogle.ts
git commit -m "feat: sync big spending analytics cutoff"
```

### Task 3: Add the Settings cutoff editor

**Files:**
- Create: `src/components/AnalyticsBigSpendingThresholdSetting.tsx`
- Create: `src/components/AnalyticsBigSpendingThresholdSetting.test.tsx`
- Modify: `src/components/SettingsDrawer.tsx`

- [ ] **Step 1: Write failing component behavior tests**

Create `src/components/AnalyticsBigSpendingThresholdSetting.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsBigSpendingThresholdSetting } from './AnalyticsBigSpendingThresholdSetting';

describe('AnalyticsBigSpendingThresholdSetting', () => {
  it('commits a positive amount on blur and clears a blank value', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={null}
        disabled={false}
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Big spending cutoff in THB' });
    await user.type(input, '10000');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(10_000);

    rerender(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={10_000}
        disabled={false}
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    await user.click(input);
    await user.clear(input);
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it('rejects non-positive input and restores the durable value', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onInvalid = vi.fn();
    render(
      <AnalyticsBigSpendingThresholdSetting
        currency="USD"
        value={500}
        disabled={false}
        onCommit={onCommit}
        onInvalid={onInvalid}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Big spending cutoff in USD' });
    await user.clear(input);
    await user.type(input, '-1');
    await user.tab();
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('500');
  });

  it('cancels an edit with Escape and disables input while saving', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={10_000}
        disabled={false}
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Big spending cutoff in THB' });
    await user.clear(input);
    await user.type(input, '20000');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('10000');
    expect(onCommit).not.toHaveBeenCalled();

    rerender(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={10_000}
        disabled
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    expect(input).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the new component test and verify RED**

Run:

```bash
npm test -- src/components/AnalyticsBigSpendingThresholdSetting.test.tsx
```

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: Implement the focused Settings row**

Create `src/components/AnalyticsBigSpendingThresholdSetting.tsx`:

```tsx
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
        <BadgeDollarSign className="h-4 w-4" />
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
```

- [ ] **Step 4: Wire the row to the existing onboarding mutation**

In `src/components/SettingsDrawer.tsx`, import the new component and place it after a separator
beneath `AnalyticsBaseCurrencySetting`:

```tsx
<AnalyticsBaseCurrencySetting
  value={onboarding.analyticsBaseCurrency}
  disabled={isUpdating}
  onChange={(analyticsBaseCurrency) => {
    const updatedAt = new Date().toISOString();
    void updateOnboarding({
      analyticsBaseCurrency,
      analyticsBaseCurrencyUpdatedAt: updatedAt,
      analyticsBigSpendingThreshold: {
        amount: null,
        currency: analyticsBaseCurrency,
        updatedAt,
      },
    }).catch(() => onToast('Base currency saved locally; sync pending'));
  }}
/>
<div className="ml-[56px] h-px bg-border/70" />
<AnalyticsBigSpendingThresholdSetting
  currency={onboarding.analyticsBaseCurrency}
  value={
    onboarding.analyticsBigSpendingThreshold?.currency ===
    onboarding.analyticsBaseCurrency
      ? onboarding.analyticsBigSpendingThreshold.amount
      : null
  }
  disabled={isUpdating}
  onInvalid={() => onToast('Enter an amount greater than zero.')}
  onCommit={(amount) => {
    void updateOnboarding({
      analyticsBigSpendingThreshold: {
        amount,
        currency: onboarding.analyticsBaseCurrency,
        updatedAt: new Date().toISOString(),
      },
    }).catch(() =>
      onToast('Big spending cutoff saved locally; sync pending'),
    );
  }}
/>
```

- [ ] **Step 5: Run Settings component tests and verify GREEN**

Run:

```bash
npm test -- src/components/AnalyticsBigSpendingThresholdSetting.test.tsx src/components/AnalyticsBaseCurrencySetting.test.tsx
```

Expected: both files pass.

- [ ] **Step 6: Commit the Settings UI**

```bash
git add src/components/AnalyticsBigSpendingThresholdSetting.tsx src/components/AnalyticsBigSpendingThresholdSetting.test.tsx src/components/SettingsDrawer.tsx
git commit -m "feat: configure big spending analytics cutoff"
```

### Task 4: Filter analytics after base-currency conversion

**Files:**
- Modify: `src/components/TransactionFlow/analytics.ts`
- Modify: `src/components/TransactionFlow/analytics.test.ts`

- [ ] **Step 1: Write failing boundary, conversion, and scope tests**

Add a `no big spending analytics` describe block to `analytics.test.ts`:

```ts
describe('no big spending analytics', () => {
  it('excludes equal and larger expenses from current and comparison scopes', () => {
    const summary = readySummary({
      transactions: [
        transaction({ id: 'below', date: '2026-08-17T10:00:00', amount: 9_999 }),
        transaction({ id: 'equal', date: '2026-08-16T10:00:00', amount: 10_000 }),
        transaction({ id: 'above', date: '2026-08-15T10:00:00', amount: 20_000 }),
        transaction({ id: 'prior-below', date: '2026-08-10T10:00:00', amount: 8_000 }),
        transaction({ id: 'prior-equal', date: '2026-08-09T10:00:00', amount: 10_000 }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      bigSpendingThreshold: 10_000,
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });
    expect(summary.expenseTotal).toBe(9_999);
    expect(summary.previousExpenseTotal).toBe(8_000);
    expect(summary.excludedBigSpendingCount).toBe(2);
    expect(summary.transactions.map((row) => row.id)).toEqual(['below']);
    expect(summary.buckets.flatMap((bucket) => bucket.transactionIds)).toEqual(['below']);
  });

  it('compares foreign expenses after conversion and retains other transaction types', () => {
    const summary = readySummary({
      transactions: [
        transaction({
          id: 'usd-large',
          date: '2026-08-17T10:00:00',
          amount: 300,
          currency: 'USD',
        }),
        transaction({ id: 'refund', date: '2026-08-17T09:00:00', amount: -20_000 }),
        transaction({
          id: 'income',
          date: '2026-08-17T08:00:00',
          type: 'income',
          amount: 30_000,
        }),
        transaction({
          id: 'transfer',
          date: '2026-08-17T07:00:00',
          type: 'transfer',
          amount: 30_000,
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      bigSpendingThreshold: 10_000,
      rates: [
        {
          id: 'THB:USD:2026-08-17',
          base: 'THB',
          quote: 'USD',
          date: '2026-08-17',
          rate: 0.03,
          fetchedAt: '2026-08-17T12:00:00.000Z',
        },
      ],
      now: new Date(2026, 7, 17, 12),
    });
    expect(summary.excludedBigSpendingCount).toBe(1);
    expect(summary.expenseTotal).toBe(-20_000);
    expect(summary.incomeTotal).toBe(30_000);
    expect(summary.transactions.map((row) => row.id)).toEqual([
      'refund',
      'income',
      'transfer',
    ]);
  });

  it('preserves existing results when the threshold is omitted', () => {
    const input = {
      transactions: [
        transaction({ id: 'large', date: '2026-08-17T10:00:00', amount: 20_000 }),
      ],
      range: 'week' as const,
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    };
    const summary = readySummary(input);
    expect(summary.expenseTotal).toBe(20_000);
    expect(summary.excludedBigSpendingCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the analytics test and verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/analytics.test.ts
```

Expected: FAIL because the builder has no threshold input or excluded count.

- [ ] **Step 3: Filter rows only after conversion**

Extend the input and summary types in `analytics.ts`:

```ts
export type AnalyticsSummary = {
  // existing fields
  excludedBigSpendingCount: number;
};

type BuildAnalyticsSummaryInput = {
  transactions: TransactionRecord[];
  range: AnalyticsRange;
  baseCurrency: string;
  rates: ExchangeRateRecord[];
  now: Date;
  bigSpendingThreshold?: number | null;
};

type AnalyticsRateRequestInput = Omit<
  BuildAnalyticsSummaryInput,
  'rates' | 'bigSpendingThreshold'
>;
```

Destructure `bigSpendingThreshold`, then filter after defining `convertedAmount`:

```ts
const threshold =
  typeof bigSpendingThreshold === 'number' &&
  Number.isFinite(bigSpendingThreshold) &&
  bigSpendingThreshold > 0
    ? bigSpendingThreshold
    : null;
const isBigSpending = (row: TransactionRecord) =>
  threshold !== null &&
  row.type === 'expense' &&
  convertedAmount(row) > 0 &&
  convertedAmount(row) >= threshold;
const scopedCurrentRows = currentRows.filter((row) => !isBigSpending(row));
const scopedComparisonRows = comparisonRows.filter((row) => !isBigSpending(row));
const excludedBigSpendingCount = currentRows.length - scopedCurrentRows.length;
```

Use `scopedCurrentRows` and `scopedComparisonRows` for every aggregate, bucket, category,
transaction-list, and `hasExpenseRows` field. Return `excludedBigSpendingCount` in the summary.
Keep `contributingRows` and the rate-resolution loop based on unfiltered rows.

- [ ] **Step 4: Run analytics tests and verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/analytics.test.ts
```

Expected: all analytics tests pass.

- [ ] **Step 5: Commit the pure analytics behavior**

```bash
git add src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
git commit -m "feat: exclude big spending from analytics"
```

### Task 5: Add the icon-only drawer mode and preserve the compact summary

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Modify: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Modify: `src/components/TransactionFlow/index.tsx`

- [ ] **Step 1: Write the failing icon contract test**

Update the shared `AnalyticsDrawer` renders with the new controlled props, then add:

```tsx
it('renders one icon-only no big spending toggle with accessible state', async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  render(
    <AnalyticsDrawer
      open
      onOpenChange={vi.fn()}
      summary={{ ...makeSummary(), excludedBigSpendingCount: 2 }}
      baseCurrency="THB"
      bigSpendingThreshold={10_000}
      noBigSpending
      onNoBigSpendingToggle={onToggle}
      range="week"
      onRangeChange={vi.fn()}
      isLoading={false}
      hasCompleteHistory
      isOffline={false}
      error={null}
      onRetry={vi.fn()}
      onSelectTransaction={vi.fn()}
    />,
  );
  const toggle = screen.getByRole('button', {
    name: 'No big spending mode on; 2 expenses at or above ฿10,000 excluded',
  });
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(toggle).toHaveTextContent('');
  await user.click(toggle);
  expect(onToggle).toHaveBeenCalledTimes(1);
});
```

Add an unconfigured accessible-name assertion:

```tsx
expect(
  screen.getByRole('button', {
    name: 'No big spending mode unavailable; set a big spending cutoff in Settings',
  }),
).toHaveAttribute('aria-pressed', 'false');
```

- [ ] **Step 2: Write the failing carousel isolation and reset test**

Extend captured drawer props in `HomeDashboardCarousel.test.tsx` with the mode state and callback.
Render a mock toggle button inside the mocked drawer, then add:

```tsx
it('filters only drawer analytics and resets the mode after close', async () => {
  const user = userEvent.setup();
  const date = new Date().toISOString();
  historyData = [
    {
      id: 'ordinary',
      type: 'expense',
      amount: 100,
      currency: 'THB',
      account: 'Cash',
      for: 'Me',
      category: 'Dining Out',
      date,
      status: 'synced',
      createdAt: date,
      updatedAt: date,
    },
    {
      id: 'large',
      type: 'expense',
      amount: 10_000,
      currency: 'THB',
      account: 'Cash',
      for: 'Me',
      category: 'Travel',
      date,
      status: 'synced',
      createdAt: date,
      updatedAt: date,
    },
  ];
  renderCarousel({ bigSpendingThreshold: 10_000 });
  await user.click(screen.getByText('Analytics content'));
  await user.click(screen.getByRole('button', { name: 'Toggle no big spending' }));

  expect(slideProps.at(-1)?.summary?.expenseTotal).toBe(10_100);
  expect(drawerProps.at(-1)?.summary?.expenseTotal).toBe(100);
  expect(drawerProps.at(-1)?.noBigSpending).toBe(true);

  await user.click(screen.getByText('Close analytics drawer'));
  await user.click(screen.getByText('Analytics content'));
  expect(drawerProps.at(-1)?.noBigSpending).toBe(false);
  expect(drawerProps.at(-1)?.summary?.expenseTotal).toBe(10_100);
});
```

Add a separate case rendering without a cutoff, pressing the mock toggle, and expecting
`onToast('Set a big spending cutoff in Settings.')` while `noBigSpending` remains false.

- [ ] **Step 3: Run drawer and carousel tests and verify RED**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: FAIL because the new props, icon, filtered drawer summary, and reset behavior are absent.

- [ ] **Step 4: Render the icon-only controlled toggle**

In `AnalyticsDrawer.tsx`, import `BadgeDollarSign` and `cn`, add these props, and derive the accessible
label:

```ts
baseCurrency: string;
bigSpendingThreshold: number | null;
noBigSpending: boolean;
onNoBigSpendingToggle: () => void;
```

```ts
const thresholdLabel =
  bigSpendingThreshold === null
    ? null
    : formatAnalyticsAmount(bigSpendingThreshold, baseCurrency);
const noBigSpendingLabel =
  thresholdLabel === null
    ? 'No big spending mode unavailable; set a big spending cutoff in Settings'
    : noBigSpending
      ? `No big spending mode on; ${summary?.excludedBigSpendingCount ?? 0} expenses at or above ${thresholdLabel} excluded`
      : `Turn on no big spending mode; exclude expenses at or above ${thresholdLabel}`;
```

Place exactly one button at the end of the range-control row:

```tsx
<button
  type="button"
  aria-label={noBigSpendingLabel}
  aria-pressed={noBigSpending}
  onClick={onNoBigSpendingToggle}
  className={cn(
    'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    noBigSpending && 'bg-primary/12 text-primary',
  )}
>
  <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
</button>
```

Do not add a visible label, count, badge, or shadow.

- [ ] **Step 5: Build separate compact and drawer summaries**

In `HomeDashboardCarousel.tsx`, add props and state:

```ts
type HomeDashboardCarouselProps = {
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  onToast: (message: string) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
};

const [noBigSpending, setNoBigSpending] = useState(false);
```

If a settings refresh removes the usable current-currency cutoff while the drawer is open, turn
the mode off:

```ts
useEffect(() => {
  if (bigSpendingThreshold === null) setNoBigSpending(false);
}, [bigSpendingThreshold]);
```

Keep the existing `analyticsResult` and `summary` unchanged for `AnalyticsSlide`. Derive a second
result only for the drawer:

```ts
const drawerAnalyticsResult = useMemo(() => {
  if (!noBigSpending || bigSpendingThreshold === null) return analyticsResult;
  if (historyQuery.data === undefined) return undefined;
  if (rateRequest && ratesQuery.data === undefined && !ratesQuery.error) return undefined;
  return buildAnalyticsSummary({
    transactions,
    range,
    baseCurrency,
    bigSpendingThreshold,
    rates: ratesQuery.data?.rates ?? [],
    now: analyticsNow,
  });
}, [
  analyticsNow,
  analyticsResult,
  baseCurrency,
  bigSpendingThreshold,
  historyQuery.data,
  noBigSpending,
  range,
  rateRequest,
  ratesQuery.data,
  ratesQuery.error,
  transactions,
]);
const drawerSummary =
  drawerAnalyticsResult?.status === 'ready' ? drawerAnalyticsResult.summary : undefined;
```

Reset in the existing close handler and pass controlled props:

```ts
if (!open) {
  setNoBigSpending(false);
  window.requestAnimationFrame(() => analyticsTriggerRef.current?.focus());
}
```

```tsx
<AnalyticsDrawer
  // existing props
  summary={drawerSummary}
  baseCurrency={baseCurrency}
  bigSpendingThreshold={bigSpendingThreshold}
  noBigSpending={noBigSpending}
  onNoBigSpendingToggle={() => {
    if (bigSpendingThreshold === null) {
      onToast('Set a big spending cutoff in Settings.');
      return;
    }
    setNoBigSpending((current) => !current);
  }}
/>
```

- [ ] **Step 6: Resolve only the current base-currency cutoff at the flow boundary**

In `TransactionFlow/index.tsx`, derive and pass the setting:

```ts
const bigSpendingThreshold =
  onboarding.analyticsBigSpendingThreshold?.currency ===
    onboarding.analyticsBaseCurrency &&
  onboarding.analyticsBigSpendingThreshold.amount !== null
    ? onboarding.analyticsBigSpendingThreshold.amount
    : null;
```

```tsx
<HomeDashboardCarousel
  baseCurrency={onboarding.analyticsBaseCurrency}
  bigSpendingThreshold={bigSpendingThreshold}
  onToast={handleToast}
  onEditTransaction={handleEditTransaction}
/>
```

- [ ] **Step 7: Run the focused component flow and verify GREEN**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx
```

Expected: both files pass, including drawer-only filtering, icon accessibility, unconfigured toast,
and reset-on-close.

- [ ] **Step 8: Commit the drawer interaction**

```bash
git add src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/index.tsx
git commit -m "feat: toggle no big spending analytics"
```

### Task 6: Verify and prepare the stacked pull request

**Files:**
- Modify only files changed by formatter or fixes required by verification.

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all Vitest files and tests pass with zero failures.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: exit 0 with no errors.

- [ ] **Step 3: Run TypeScript validation**

```bash
npx tsc --noEmit
```

Expected: exit 0 with no diagnostics.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: exit 0 and production assets generated successfully.

- [ ] **Step 5: Confirm stacked scope**

```bash
git status --short --branch
git log --oneline feat/multi-currency-analytics..HEAD
git diff --stat feat/multi-currency-analytics...HEAD
```

Expected: a clean working tree; only this spec, plan, implementation, and tests are ahead of
`feat/multi-currency-analytics`.

- [ ] **Step 6: Commit verification-only fixes if present**

If verification required a source or test correction, stage only those files and commit:

```bash
git commit -m "fix: harden no big spending analytics"
```

If the tree is already clean, do not create an empty commit.

- [ ] **Step 7: Publish as a stacked PR**

Push `feat/no-big-spending-analytics` and open a pull request with base
`feat/multi-currency-analytics`. The PR body must state that the home analytics carousel remains
unfiltered and that the mode resets when the analytics sheet closes.
