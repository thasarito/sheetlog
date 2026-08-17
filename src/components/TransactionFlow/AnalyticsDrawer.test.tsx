import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import {
  buildAnalyticsSummary,
  type AnalyticsPeriodOption,
  type AnalyticsRange,
  type DatePeriod,
} from './analytics';
import { AnalyticsDrawer } from './AnalyticsDrawer';

const customPeriod: DatePeriod = {
  start: new Date(2026, 7, 1),
  end: new Date(2026, 7, 17),
};

const transactions: TransactionRecord[] = [
  {
    id: 'dining',
    type: 'expense',
    amount: 120,
    currency: 'THB',
    account: 'Cash',
    for: 'Me',
    category: 'Dining Out',
    date: '2026-08-17T12:00:00',
    status: 'synced',
    sheetRowValid: true,
    createdAt: '2026-08-17T12:00:00',
    updatedAt: '2026-08-17T12:00:00',
  },
  {
    id: 'coffee',
    type: 'expense',
    amount: 80,
    currency: 'THB',
    account: 'Cash',
    for: 'Me',
    category: 'Coffee',
    date: '2026-08-16T12:00:00',
    status: 'synced',
    sheetRowValid: true,
    createdAt: '2026-08-16T12:00:00',
    updatedAt: '2026-08-16T12:00:00',
  },
  {
    id: 'income',
    type: 'income',
    amount: 500,
    currency: 'THB',
    account: 'Bank',
    for: 'Me',
    category: 'Salary',
    date: '2026-08-15T12:00:00',
    status: 'synced',
    sheetRowValid: true,
    createdAt: '2026-08-15T12:00:00',
    updatedAt: '2026-08-15T12:00:00',
  },
];

const periodOptions: AnalyticsPeriodOption[] = [
  {
    key: 'week-previous',
    offset: -1,
    label: 'Aug 4–10',
    accessibleLabel: 'August 4, 2026 through August 10, 2026',
    period: {
      start: new Date(2026, 7, 4),
      end: new Date(2026, 7, 10, 23, 59, 59, 999),
    },
  },
  {
    key: 'week-current',
    offset: 0,
    label: 'Aug 11–17',
    accessibleLabel: 'August 11, 2026 through August 17, 2026',
    period: {
      start: new Date(2026, 7, 11),
      end: new Date(2026, 7, 17, 23, 59, 59, 999),
    },
  },
];

function makeSummary(
  rows: TransactionRecord[] = transactions,
  range: AnalyticsRange = 'week',
  selectedCustomPeriod: DatePeriod = customPeriod,
  periodOffset = 0,
) {
  const result = buildAnalyticsSummary({
    transactions: rows,
    range,
    baseCurrency: 'THB',
    rates: [],
    now: new Date(2026, 7, 17, 12),
    customPeriod: selectedCustomPeriod,
    periodOffset,
  });
  if (result.status !== 'ready') throw new Error('Expected ready analytics');
  return result.summary;
}

const baseProps: ComponentProps<typeof AnalyticsDrawer> = {
  open: true,
  onOpenChange: vi.fn(),
  transactions,
  range: 'week',
  onRangeChange: vi.fn(),
  periodOptions,
  periodOffset: 0,
  onPeriodChange: vi.fn(),
  customPeriod,
  onCustomPeriodChange: vi.fn(),
  summary: makeSummary(),
  isLoading: false,
  hasCompleteHistory: true,
  isOffline: false,
  error: null,
  onRetry: vi.fn(),
  onSelectTransaction: vi.fn(),
  now: new Date(2026, 7, 17, 12),
};

function renderDrawer(overrides: Partial<ComponentProps<typeof AnalyticsDrawer>> = {}) {
  const props = { ...baseProps, ...overrides };
  if (!Object.hasOwn(overrides, 'summary')) {
    props.summary = makeSummary(
      props.transactions,
      props.range,
      props.customPeriod,
      props.periodOffset,
    );
  }
  return render(<AnalyticsDrawer {...props} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnalyticsDrawer', () => {
  it('opens with a requested bucket selected and filters matching transactions', async () => {
    renderDrawer({ initialSelectedBucket: '2026-08-17' });

    const selectedBar = screen.getByRole('option', { name: /Monday, August 17/ });
    await waitFor(() => expect(selectedBar).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Coffee/ })).not.toBeInTheDocument();
  });

  it('puts the stacked chart first and reacts across Overview, categories, and Transactions', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Analytics' })).toHaveFocus());
    const trend = screen.getByRole('region', { name: 'Spending trend' });
    const overview = screen.getByRole('region', { name: 'Overview' });
    expect(trend.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(overview).getAllByText('฿200').length).toBeGreaterThan(0);
    expect(within(overview).getByText('฿500')).toBeInTheDocument();
    expect(within(overview).getByText('฿300')).toBeInTheDocument();
    expect(
      within(overview).getByLabelText(
        'Spending by category: Dining Out 60%, Coffee 40%. Expenses ฿200',
      ),
    ).toBeInTheDocument();
    const transactionSection = screen.getByRole('region', { name: 'Transactions' });
    expect(within(transactionSection).getByText('Today')).toBeInTheDocument();
    expect(within(transactionSection).getByText('Yesterday')).toBeInTheDocument();
    expect(within(transactionSection).getByText('Saturday, Aug 15')).toBeInTheDocument();
    expect(
      within(transactionSection).getByRole('button', { name: /expense Dining Out/ }),
    ).toHaveTextContent('−฿120.00');

    await user.click(screen.getByRole('option', { name: /Monday, August 17, ฿120/ }));

    expect(within(overview).getAllByText('฿120').length).toBeGreaterThan(0);
    expect(within(overview).getByText('฿0')).toBeInTheDocument();
    expect(within(overview).getByText('-฿120')).toBeInTheDocument();
    expect(
      within(overview).getByLabelText(
        'Spending by category: Dining Out 100%, Coffee 0%. Expenses ฿120',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coffee, ฿0, 0%' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Coffee/ })).not.toBeInTheDocument();
    expect(within(transactionSection).getAllByText('Today')).toHaveLength(1);
    expect(within(transactionSection).queryByText('Yesterday')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toHaveTextContent(
      'Monday, August 17 · ฿120',
    );

    await user.click(screen.getByRole('button', { name: /Clear selected period filter/ }));
    expect(within(transactionSection).getByText('Today')).toBeInTheDocument();
    expect(within(transactionSection).getByText('Yesterday')).toBeInTheDocument();
    expect(within(transactionSection).getByText('Saturday, Aug 15')).toBeInTheDocument();
  });

  it('intersects category and bucket filters while clearing each independently', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const selectedBar = screen.getByRole('option', { name: /Monday, August 17/ });
    await user.click(selectedBar);
    await user.click(screen.getByRole('button', { name: 'Coffee, ฿0, 0%' }));

    expect(selectedBar).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear selected period filter/ }));
    expect(screen.getByRole('button', { name: /expense Coffee/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Dining Out/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear analytics filters' }));
    expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Coffee/ })).toBeInTheDocument();
  });

  it('cancels a nested custom range without closing Analytics or clearing filters', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    await user.click(screen.getByRole('button', { name: 'Coffee, ฿0, 0%' }));
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();

    const customTrigger = screen.getByRole('button', { name: 'Custom date range' });
    await user.click(customTrigger);

    const customDialog = screen.getByRole('dialog', { name: 'Custom date range' });
    expect(customDialog).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Analytics', hidden: true }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel custom range' }));

    expect(customDialog).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('dialog', { name: 'Analytics' })).toBeVisible();
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();
    await waitFor(() => expect(customTrigger).toHaveFocus());
  });

  it('applies a nested custom range and leaves Analytics open', async () => {
    const user = userEvent.setup();

    function CustomRangeHarness() {
      const [selectedRange, setSelectedRange] = useState<AnalyticsRange>('month');
      const [selectedPeriod, setSelectedPeriod] = useState(customPeriod);
      return (
        <AnalyticsDrawer
          {...baseProps}
          summary={makeSummary(transactions, selectedRange, selectedPeriod)}
          range={selectedRange}
          onRangeChange={setSelectedRange}
          customPeriod={selectedPeriod}
          onCustomPeriodChange={setSelectedPeriod}
        />
      );
    }

    render(<CustomRangeHarness />);
    const customTrigger = screen.getByRole('button', { name: 'Custom date range' });
    await user.click(customTrigger);
    const customDialog = screen.getByRole('dialog', { name: 'Custom date range' });
    await user.click(screen.getByRole('button', { name: /August 15th, 2026/ }));
    await user.click(screen.getByRole('button', { name: /August 16th, 2026/ }));
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

    expect(customDialog).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('dialog', { name: 'Analytics' })).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Analytics summary update' }),
    ).toHaveTextContent(
      'Custom, Aug 15 through Aug 16 · Expenses ฿80',
    );
    expect(customTrigger).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets drill-down when the analytics scope changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDrawer();
    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();

    rerender(
      <AnalyticsDrawer
        {...baseProps}
        summary={makeSummary(transactions, 'month')}
        range="month"
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Clear selected period filter/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole('listbox', { name: 'Select analytics period' }))
        .getAllByRole('option')
        .every((option) => option.getAttribute('aria-selected') === 'false'),
    ).toBe(true);
  });

  it('shares period changes and clears an active drill-down before changing period', async () => {
    const user = userEvent.setup();
    const onPeriodChange = vi.fn();
    renderDrawer({ onPeriodChange });

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();

    await user.click(
      screen.getByRole('option', {
        name: 'August 4, 2026 through August 10, 2026',
      }),
    );
    expect(onPeriodChange).toHaveBeenCalledWith(-1);
    expect(
      screen.queryByRole('button', { name: /Clear selected period filter/ }),
    ).not.toBeInTheDocument();
  });

  it('clears bucket and category filters whenever the sheet closes', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen analytics
          </button>
          <AnalyticsDrawer {...baseProps} open={open} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    await user.click(screen.getByRole('button', { name: /Dining Out,/ }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close analytics' }));
    fireEvent.click(screen.getByText('Reopen analytics'));

    expect(
      screen.queryByRole('button', { name: /Clear selected period filter/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Coffee/ })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'August 11, 2026 through August 17, 2026' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('shares the range control and closes before editing a row', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onOpenChange = vi.fn();
    const onSelectTransaction = vi.fn();
    renderDrawer({
      onRangeChange,
      onOpenChange,
      onSelectTransaction,
    });

    await user.click(screen.getByRole('button', { name: 'Quarter, quarter to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('quarter');
    expect(screen.queryByRole('combobox', { name: 'Analytics currency' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Frankfurter|All currencies/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /expense Dining Out/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectTransaction).toHaveBeenCalledWith(transactions[0]);
  });

  it('politely announces the selected period and recomputed expense total', async () => {
    const user = userEvent.setup();
    function RangeHarness() {
      const [selectedRange, setSelectedRange] = useState<AnalyticsRange>('week');
      return (
        <AnalyticsDrawer
          {...baseProps}
          summary={makeSummary(transactions, selectedRange)}
          range={selectedRange}
          onRangeChange={setSelectedRange}
        />
      );
    }
    render(<RangeHarness />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('Week, last 7 days · Expenses ฿200');

    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    expect(status).toHaveTextContent('Month, month to date · Expenses ฿200');

    await user.click(screen.getByRole('button', { name: 'Year, year to date' }));
    expect(status).toHaveTextContent('Year, year to date · Expenses ฿200');

    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(status).toHaveTextContent(
      'Monday, August 17, ฿120 · Dining Out ฿120 · Income ฿0 · Net -฿120',
    );
  });

  it('keeps local periods available while complete analytics are loading or unavailable', () => {
    const { rerender } = renderDrawer({ isLoading: true, hasCompleteHistory: false });

    const status = screen.getByRole('status', { name: 'Analytics summary update' });
    expect(status).toHaveTextContent('Loading Week, last 7 days analytics');
    expect(status).not.toHaveTextContent('Expenses ฿200');
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsDrawer
        {...baseProps}
        hasCompleteHistory={false}
        isOffline
      />,
    );
    expect(status).toHaveTextContent('Full range unavailable offline');
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsDrawer
        {...baseProps}
        hasCompleteHistory={false}
        error={new Error('network')}
      />,
    );
    expect(status).toHaveTextContent('Analytics unavailable');
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();
  });

  it('groups categories after the top four into a selectable Other row', async () => {
    const user = userEvent.setup();
    const categories = [
      'Category A',
      'Category B',
      'Category C',
      'Category D',
      'Category E',
      'Category F',
      'Category G',
    ];
    const manyCategories = categories.map(
      (category, index): TransactionRecord => ({
        id: `category-${index}`,
        type: 'expense',
        amount: 70 - index * 10,
        currency: 'THB',
        account: 'Cash',
        for: 'Me',
        category,
        date: '2026-08-17T12:00:00',
        status: 'synced',
        sheetRowValid: true,
        createdAt: '2026-08-17T12:00:00',
        updatedAt: '2026-08-17T12:00:00',
      }),
    );
    renderDrawer({ transactions: manyCategories });

    await user.click(screen.getByRole('button', { name: /^Other,/ }));
    expect(screen.getByRole('button', { name: /expense Category E/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Category F/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Category G/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Category A/ })).not.toBeInTheDocument();
  });

  it('shows the missing historical rate before generic offline errors', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderDrawer({
      missingRate: { currency: 'USD', date: '2026-08-16' },
      isOffline: true,
      error: new Error('network'),
      onRetry,
    });

    expect(screen.getByText('Rate unavailable for USD on Aug 16')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
