import { render, screen, waitFor, within } from '@testing-library/react';
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
import { AnalyticsView } from './AnalyticsView';

const customPeriod: DatePeriod = {
  start: new Date(2026, 7, 1),
  end: new Date(2026, 7, 19),
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
    date: '2026-08-18T12:00:00',
    status: 'synced',
    sheetRowValid: true,
    createdAt: '2026-08-18T12:00:00',
    updatedAt: '2026-08-18T12:00:00',
  },
  {
    id: 'income',
    type: 'income',
    amount: 500,
    currency: 'THB',
    account: 'Bank',
    for: 'Me',
    category: 'Salary',
    date: '2026-08-19T12:00:00',
    status: 'synced',
    sheetRowValid: true,
    createdAt: '2026-08-19T12:00:00',
    updatedAt: '2026-08-19T12:00:00',
  },
];

const periodOptions: AnalyticsPeriodOption[] = [
  {
    key: 'week-previous',
    offset: -1,
    label: 'Aug 10–16',
    accessibleLabel: 'August 10, 2026 through August 16, 2026',
    period: {
      start: new Date(2026, 7, 10),
      end: new Date(2026, 7, 16, 23, 59, 59, 999),
    },
  },
  {
    key: 'week-current',
    offset: 0,
    label: 'Aug 17–23',
    accessibleLabel: 'August 17, 2026 through August 23, 2026',
    period: {
      start: new Date(2026, 7, 17),
      end: new Date(2026, 7, 23, 23, 59, 59, 999),
    },
  },
];

function makeSummary(
  rows: TransactionRecord[] = transactions,
  range: AnalyticsRange = 'week',
  selectedCustomPeriod: DatePeriod = customPeriod,
  periodOffset = 0,
  now = new Date(2026, 7, 17, 12),
) {
  const result = buildAnalyticsSummary({
    transactions: rows,
    range,
    baseCurrency: 'THB',
    rates: [],
    now,
    customPeriod: selectedCustomPeriod,
    periodOffset,
  });
  if (result.status !== 'ready') throw new Error('Expected ready analytics');
  return result.summary;
}

function defaultNoBigSpendingProps() {
  return {
    baseCurrency: 'THB',
    bigSpendingThreshold: null,
    noBigSpending: false,
    onNoBigSpendingToggle: vi.fn(),
  } as const;
}

const baseProps: ComponentProps<typeof AnalyticsView> = {
  ...defaultNoBigSpendingProps(),
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
  now: new Date(2026, 7, 19, 12),
};

function renderView(overrides: Partial<ComponentProps<typeof AnalyticsView>> = {}) {
  const props = { ...baseProps, ...overrides };
  if (!Object.hasOwn(overrides, 'summary')) {
    props.summary = makeSummary(
      props.transactions,
      props.range,
      props.customPeriod,
      props.periodOffset,
      props.now,
    );
  }
  return render(<AnalyticsView {...props} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});
describe('AnalyticsView', () => {
  it('renders detailed analytics directly without outer modal controls', () => {
    renderView();

    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Close analytics' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Analytics' }),
    ).not.toBeInTheDocument();
  });

  it('renders the shared grouped axis for a complete quarter', () => {
    renderView({
      range: 'quarter',
      transactions: [],
      now: new Date(2026, 4, 15, 12),
    });

    const axis = screen.getByTestId('analytics-grouped-axis');
    expect(axis).toHaveTextContent('Apr');
    expect(axis).toHaveTextContent('May');
    expect(axis).toHaveTextContent('Jun');
  });

  it('renders the shared dense axis for a complete month', () => {
    renderView({
      range: 'month',
      transactions: [],
      now: new Date(2026, 5, 15, 12),
    });

    const labels = within(screen.getByTestId('analytics-month-axis'))
      .getAllByTestId('analytics-month-axis-label')
      .map((label) => label.textContent);
    expect(labels.slice(0, 8)).toEqual(['1', 'T', 'W', 'T', 'F', 'S', 'S', '8']);
  });

  it('puts the stacked chart first and reacts across Overview, categories, and Transactions', async () => {
    const user = userEvent.setup();
    renderView();

    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeVisible();
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
    expect(within(transactionSection).getByText('Monday, Aug 17')).toBeInTheDocument();
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
    expect(within(transactionSection).getAllByText('Monday, Aug 17')).toHaveLength(1);
    expect(within(transactionSection).queryByText('Yesterday')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toHaveTextContent(
      'Monday, August 17 · ฿120',
    );

    await user.click(screen.getByRole('button', { name: /Clear selected period filter/ }));
    expect(within(transactionSection).getByText('Today')).toBeInTheDocument();
    expect(within(transactionSection).getByText('Yesterday')).toBeInTheDocument();
    expect(within(transactionSection).getByText('Monday, Aug 17')).toBeInTheDocument();
  });

  it('hides transfer helper copy while keeping transfers out of totals', () => {
    renderView({
      transactions: [
        ...transactions,
        {
          ...transactions[0],
          id: 'transfer',
          type: 'transfer',
          amount: 900,
          category: 'Savings',
        },
      ],
    });

    const overview = screen.getByRole('region', { name: 'Overview' });
    expect(within(overview).getAllByText('฿200').length).toBeGreaterThan(0);
    expect(within(overview).getByText('฿500')).toBeInTheDocument();
    expect(within(overview).getByText('฿300')).toBeInTheDocument();
    expect(screen.queryByText('Transfers are excluded from totals.')).not.toBeInTheDocument();
  });

  it('shows resolved and unavailable base amounts from the analytics summary', () => {
    const foreignExpense: TransactionRecord = {
      ...transactions[0],
      id: 'foreign-expense',
      amount: 3,
      currency: 'USD',
      category: 'Foreign coffee',
    };
    const foreignTransfer: TransactionRecord = {
      ...transactions[0],
      id: 'foreign-transfer',
      type: 'transfer',
      amount: 3,
      currency: 'USD',
      category: 'Foreign savings',
    };
    const summary = {
      ...makeSummary(),
      transactions: [foreignExpense, foreignTransfer],
      convertedAmounts: { 'foreign-expense': 100 },
    };

    renderView({
      transactions: [foreignExpense, foreignTransfer],
      summary,
    });

    expect(screen.getByText('≈ −฿100.00')).toBeInTheDocument();
    expect(screen.getByText('≈ ฿—')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Foreign coffee.*approximately minus 100\.00 THB/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: /Foreign savings.*base amount unavailable in THB/,
      }),
    ).toBeEnabled();
  });

  it('intersects category and bucket filters while clearing each independently', async () => {
    const user = userEvent.setup();
    renderView();

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

  it('cancels a standalone custom range without clearing filters', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    await user.click(screen.getByRole('button', { name: 'Coffee, ฿0, 0%' }));
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();

    const customTrigger = screen.getByRole('button', { name: 'Custom date range' });
    await user.click(customTrigger);

    const customDialog = screen.getByRole('dialog', { name: 'Custom date range' });
    expect(customDialog).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Analytics' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel custom range' }));

    expect(customDialog).toHaveAttribute('data-state', 'closed');
    expect(
      screen.getByRole('heading', { name: 'Analytics', hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();
    await waitFor(() => expect(customTrigger).toHaveFocus());
  });

  it('applies a standalone custom range and keeps the direct view mounted', async () => {
    const user = userEvent.setup();

    function CustomRangeHarness() {
      const [selectedRange, setSelectedRange] = useState<AnalyticsRange>('month');
      const [selectedPeriod, setSelectedPeriod] = useState(customPeriod);
      return (
        <AnalyticsView
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
    await user.click(screen.getByRole('button', { name: /August 18th, 2026/ }));
    await user.click(screen.getByRole('button', { name: /August 19th, 2026/ }));
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

    expect(customDialog).toHaveAttribute('data-state', 'closed');
    expect(
      screen.getByRole('heading', { name: 'Analytics', hidden: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Analytics' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Analytics summary update' }),
    ).toHaveTextContent(
      'Custom, Aug 18 through Aug 19 · Expenses ฿80',
    );
    expect(customTrigger).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets drill-down when the analytics scope changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderView();
    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();

    rerender(
      <AnalyticsView
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
    renderView({ onPeriodChange });

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();

    await user.click(
      screen.getByRole('option', {
        name: 'August 10, 2026 through August 16, 2026',
      }),
    );
    expect(onPeriodChange).toHaveBeenCalledWith(-1);
    expect(
      screen.queryByRole('button', { name: /Clear selected period filter/ }),
    ).not.toBeInTheDocument();
  });

  it('preserves bucket and category filters while the direct view remains mounted', async () => {
    const user = userEvent.setup();
    const { rerender } = renderView();

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    await user.click(screen.getByRole('button', { name: 'Coffee, ฿0, 0%' }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();

    rerender(<AnalyticsView {...baseProps} />);

    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();
    expect(screen.getByText('No matching transactions')).toBeInTheDocument();
  });

  it('shares the range control and selects a row directly', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onSelectTransaction = vi.fn();
    renderView({
      onRangeChange,
      onSelectTransaction,
    });

    await user.click(screen.getByRole('button', { name: 'Quarter' }));
    expect(onRangeChange).toHaveBeenCalledWith('quarter');
    expect(screen.queryByRole('combobox', { name: 'Analytics currency' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Frankfurter|All currencies/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /expense Dining Out/ }));
    expect(onSelectTransaction).toHaveBeenCalledWith(transactions[0]);
  });

  it('politely announces the selected period and recomputed expense total', async () => {
    const user = userEvent.setup();
    function RangeHarness() {
      const [selectedRange, setSelectedRange] = useState<AnalyticsRange>('week');
      const selectedPeriodOptions =
        selectedRange === 'month'
          ? [
              {
                key: 'month-current',
                offset: 0,
                label: 'August 2026',
                accessibleLabel: 'August 1, 2026 through August 31, 2026',
                period: {
                  start: new Date(2026, 7, 1),
                  end: new Date(2026, 7, 31, 23, 59, 59, 999),
                },
              },
            ]
          : selectedRange === 'year'
            ? [
                {
                  key: 'year-current',
                  offset: 0,
                  label: '2026',
                  accessibleLabel: 'January 1, 2026 through December 31, 2026',
                  period: {
                    start: new Date(2026, 0, 1),
                    end: new Date(2026, 11, 31, 23, 59, 59, 999),
                  },
                },
              ]
            : periodOptions;
      return (
        <AnalyticsView
          {...baseProps}
          summary={makeSummary(transactions, selectedRange)}
          range={selectedRange}
          onRangeChange={setSelectedRange}
          periodOptions={selectedPeriodOptions}
        />
      );
    }
    render(<RangeHarness />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent(
      'August 17, 2026 through August 23, 2026 · Expenses ฿200',
    );

    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(status).toHaveTextContent('August 1, 2026 through August 31, 2026 · Expenses ฿200');

    await user.click(screen.getByRole('button', { name: 'Year' }));
    expect(status).toHaveTextContent(
      'January 1, 2026 through December 31, 2026 · Expenses ฿200',
    );

    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(status).toHaveTextContent(
      'Monday, August 17, ฿120 · Dining Out ฿120 · Income ฿0 · Net -฿120',
    );
  });

  it('keeps local periods available while complete analytics are loading or unavailable', () => {
    const { rerender } = renderView({ isLoading: true, hasCompleteHistory: false });

    const status = screen.getByRole('status', { name: 'Analytics summary update' });
    expect(status).toHaveTextContent(
      'Loading August 17, 2026 through August 23, 2026 analytics',
    );
    expect(status).not.toHaveTextContent('Expenses ฿200');
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsView
        {...baseProps}
        hasCompleteHistory={false}
        isOffline
      />,
    );
    expect(status).toHaveTextContent('Full range unavailable offline');
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsView
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
    renderView({ transactions: manyCategories });

    await user.click(screen.getByRole('button', { name: /^Other,/ }));
    expect(screen.getByRole('button', { name: /expense Category E/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Category F/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Category G/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Category A/ })).not.toBeInTheDocument();
  });

  it('renders one icon-only no big spending toggle with accessible state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderView({
      summary: { ...makeSummary(), excludedBigSpendingCount: 2 },
      baseCurrency: 'THB',
      bigSpendingThreshold: 10_000,
      noBigSpending: true,
      onNoBigSpendingToggle: onToggle,
    });

    const toggle = screen.getByRole('button', {
      name: 'No big spending mode on; 2 expenses at or above ฿10,000 excluded',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent('');
    expect(screen.getAllByRole('button', { name: /big spending/i })).toHaveLength(1);
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('explains through its accessible name when the cutoff is not configured', () => {
    renderView();

    expect(
      screen.getByRole('button', {
        name: 'No big spending mode unavailable; set a big spending cutoff in Settings',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

});
