# Grouped Analytics Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Analytics sheet render its filtered transactions with the same day headers and row presentation as the full Transactions sheet.

**Architecture:** Extract the full history sheet's date labeling, flattened date/row item model, day header, and transaction row into a presentation-only module. Keep fetching, searching, and virtualization in `TransactionHistoryDrawer`; render the filtered Analytics items directly inside its existing sheet scroller.

**Tech Stack:** React 18, TypeScript, date-fns, TanStack Virtual, Vitest/Testing Library, Playwright.

---

## File Structure

- Create `src/components/TransactionFlow/TransactionHistoryItems.tsx` for the shared flattened item type, day labels/headers, amount formatting, and row rendering.
- Create `src/components/TransactionFlow/TransactionHistoryItems.test.tsx` for grouping, labels, status, amount, and selection behavior.
- Modify `src/components/TransactionFlow/TransactionHistoryDrawer.tsx` to consume the shared primitives while retaining its query, search, virtualizer, and scroll ownership.
- Delete `src/components/TransactionFlow/TransactionRow.tsx` and `src/components/TransactionFlow/TransactionRow.test.tsx` after Analytics migrates from the superseded private row design.
- Modify `src/components/TransactionFlow/AnalyticsDrawer.tsx` and its test to render filtered rows through shared date and row items.
- Modify `e2e/home-carousel.spec.ts` to verify grouped Analytics dates and capture the grouped section.
- Add `docs/screenshots/analytics/sheet-grouped-transactions-mobile.png` as refreshed PR evidence.

### Task 1: Extract shared transaction-history presentation

**Files:**
- Create: `src/components/TransactionFlow/TransactionHistoryItems.tsx`
- Create: `src/components/TransactionFlow/TransactionHistoryItems.test.tsx`
- Modify: `src/components/TransactionFlow/TransactionHistoryDrawer.tsx`

- [ ] **Step 1: Write failing shared grouping and row tests**

Create `TransactionHistoryItems.test.tsx` with two dates, two rows on the newest date, a pending row, and a structurally invalid row. Assert the shared API before it exists:

```tsx
const newest = transaction('new-a', { date: '2026-08-17T12:00:00', amount: 120 });
const items = flattenTransactionHistory([
  newest,
  transaction('new-b', { date: '2026-08-17T09:00:00', status: 'pending' }),
  transaction('old', {
    date: '2026-08-16T08:00:00',
    sheetRowValid: false,
  }),
]);

expect(items.map((item) => item.key)).toEqual([
  'date:2026-08-17',
  'transaction:new-a',
  'transaction:new-b',
  'date:2026-08-16',
  'transaction:old',
]);

render(
  <>
    <TransactionHistoryDateHeader
      dateKey="2026-08-17"
      today={new Date(2026, 7, 17, 12)}
    />
    <TransactionHistoryRow transaction={newest} onSelect={onSelect} />
  </>,
);

expect(screen.getByText('Today')).toBeInTheDocument();
expect(screen.getByText('−฿120.00')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /expense Category new-a/ }));
expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-a' }));
```

Also render the pending and invalid rows and assert `Pending`, `Read only`, and disabled state match the current Transactions sheet.

- [ ] **Step 2: Run the shared-item test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryItems.test.tsx
```

Expected: FAIL because `TransactionHistoryItems.tsx` does not exist.

- [ ] **Step 3: Move the existing presentation into the shared module**

Define the public item model and flattening function:

```tsx
export type TransactionHistoryListItem =
  | { key: string; kind: 'date'; dateKey: string }
  | { key: string; kind: 'transaction'; transaction: TransactionRecord };

export function flattenTransactionHistory(
  transactions: readonly TransactionRecord[],
): TransactionHistoryListItem[] {
  const items: TransactionHistoryListItem[] = [];
  let previousDate = '';
  for (const transaction of transactions) {
    const dateKey = format(parseDate(transaction.date), 'yyyy-MM-dd');
    if (dateKey !== previousDate) {
      items.push({ key: `date:${dateKey}`, kind: 'date', dateKey });
      previousDate = dateKey;
    }
    items.push({
      key: `transaction:${transaction.id}`,
      kind: 'transaction',
      transaction,
    });
  }
  return items;
}
```

Export `TransactionHistoryDateHeader({ dateKey, today })` using the current `Today`, `Yesterday`, and `EEEE, MMM d` labels and the current date-header classes. Export `TransactionHistoryRow({ transaction, onSelect })` by moving the existing full-history presentation, including editability, pending/error/read-only status, account, signed amount, colors, and focus styling. Add an explicit accessible label containing time, type, category/note, account/status, signed amount, and read-only state so both consumers expose the same name.

Import those exports into `TransactionHistoryDrawer.tsx`. Keep `TransactionHistoryVirtualList`, its anchor preservation, sizing, query, search, and refresh logic in the drawer. Replace its inline date and row JSX with:

```tsx
{item.kind === 'date' ? (
  <TransactionHistoryDateHeader dateKey={item.dateKey} today={today} />
) : (
  <TransactionHistoryRow transaction={item.transaction} onSelect={onEdit} />
)}
```

- [ ] **Step 4: Run shared and full-history tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryItems.test.tsx src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx
```

Expected: PASS; virtualization and scroll anchoring remain unchanged, and shared presentation tests cover the extracted behavior.

### Task 2: Render grouped filtered transactions in Analytics

**Files:**
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Delete: `src/components/TransactionFlow/TransactionRow.tsx`
- Delete: `src/components/TransactionFlow/TransactionRow.test.tsx`

- [ ] **Step 1: Write the failing Analytics grouping test**

Within the existing `puts the stacked chart first...` test, scope assertions to the Transactions region and require shared day labels for the injected `now`:

```tsx
const transactionSection = screen.getByRole('region', { name: 'Transactions' });
expect(within(transactionSection).getByText('Today')).toBeInTheDocument();
expect(within(transactionSection).getByText('Yesterday')).toBeInTheDocument();
expect(within(transactionSection).getByText('Saturday, Aug 15')).toBeInTheDocument();
expect(
  within(transactionSection).getByRole('button', { name: /expense Dining Out/ }),
).toHaveTextContent('−฿120.00');
```

After selecting the Monday chart bucket, assert there is only one `Today` header and no `Yesterday` header. After clearing filters, assert all three headers return. Keep the existing close-before-edit assertion.

- [ ] **Step 2: Run the Analytics drawer test and verify RED**

Run:

```bash
npx vitest run src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because Analytics renders ungrouped `TransactionRow` instances.

- [ ] **Step 3: Render Analytics through the shared flattened model**

Import the shared primitives and derive items without changing the filtered result:

```tsx
const transactionItems = useMemo(
  () => flattenTransactionHistory(filteredTransactions),
  [filteredTransactions],
);
```

Replace the direct transaction map with:

```tsx
{transactionItems.length > 0 ? (
  transactionItems.map((item) =>
    item.kind === 'date' ? (
      <TransactionHistoryDateHeader key={item.key} dateKey={item.dateKey} today={now} />
    ) : (
      <TransactionHistoryRow
        key={item.key}
        transaction={item.transaction}
        onSelect={selectTransaction}
      />
    ),
  )
) : (
  <p className="py-6 text-center text-sm text-muted-foreground">
    No matching transactions
  </p>
)}
```

Do not add a query, search input, refresh action, new scroll container, or virtualizer to Analytics. Remove the obsolete `TransactionRow` files.

- [ ] **Step 4: Run focused component tests and verify GREEN**

Run:

```bash
npx vitest run src/components/TransactionFlow/TransactionHistoryItems.test.tsx src/components/TransactionFlow/TransactionHistoryDrawer.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: PASS with grouped headers, shared rows, filters, filter reset, and edit flow covered.

- [ ] **Step 5: Commit the reusable grouped list**

```bash
git add src/components/TransactionFlow/TransactionHistoryItems.tsx src/components/TransactionFlow/TransactionHistoryItems.test.tsx src/components/TransactionFlow/TransactionHistoryDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/TransactionRow.tsx src/components/TransactionFlow/TransactionRow.test.tsx
git commit -m "feat: group analytics transactions by day"
```

### Task 3: Extend mobile acceptance and refresh PR evidence

**Files:**
- Modify: `e2e/home-carousel.spec.ts`
- Create: `docs/screenshots/analytics/sheet-grouped-transactions-mobile.png`

- [ ] **Step 1: Assert grouped Analytics transactions in Mobile Chrome**

After reopening the unfiltered month sheet, scope to the Transactions region:

```ts
const analyticsTransactions = analyticsDialog.getByRole('region', {
  name: 'Transactions',
});
await expect(analyticsTransactions.getByText('Today')).toBeVisible();
await expect(analyticsTransactions.getByText('Yesterday')).toBeVisible();
await analyticsTransactions.scrollIntoViewIfNeeded();
await page.screenshot({
  path: 'test-results/analytics-grouped-transactions-mobile.png',
  fullPage: true,
});
```

Keep all existing picker, chart-height, shared-state, and close-reset assertions.

- [ ] **Step 2: Run Mobile Chrome and verify GREEN**

Run:

```bash
VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: PASS and produce `test-results/analytics-grouped-transactions-mobile.png`.

- [ ] **Step 3: Inspect and copy the screenshot**

Visually inspect the generated image, then copy it to:

```text
docs/screenshots/analytics/sheet-grouped-transactions-mobile.png
```

The capture must show at least two date groups and the shared signed amount/row treatment without clipping or horizontal overflow.

- [ ] **Step 4: Run the complete verification matrix**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
pnpm install --frozen-lockfile
VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
git diff --check
```

Expected: 76 or more unit test files pass with no failed tests; lint, typecheck, build, frozen install, Mobile Chrome, and whitespace validation all exit `0`.

- [ ] **Step 5: Commit evidence and finish PR #149**

```bash
git add e2e/home-carousel.spec.ts docs/screenshots/analytics/sheet-grouped-transactions-mobile.png
git commit -m "test: verify grouped analytics transactions"
git push --force-with-lease origin agent/stacked-analytics-chart
```

Update PR #149 with all three Analytics screenshots and the final verification counts. Monitor required GitHub and Cloudflare checks to success, request final review, then merge using the repository-supported method.
