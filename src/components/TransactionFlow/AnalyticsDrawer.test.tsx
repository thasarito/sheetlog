import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import type { AnalyticsRange, DatePeriod } from './analytics';
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

const baseProps: ComponentProps<typeof AnalyticsDrawer> = {
  open: true,
  onOpenChange: vi.fn(),
  transactions,
  range: 'week',
  onRangeChange: vi.fn(),
  customPeriod,
  onCustomPeriodChange: vi.fn(),
  currency: 'THB',
  onCurrencyChange: vi.fn(),
  currencies: ['THB'],
  isLoading: false,
  hasCompleteHistory: true,
  isOffline: false,
  error: null,
  onRetry: vi.fn(),
  onSelectTransaction: vi.fn(),
  now: new Date(2026, 7, 17, 12),
};

function renderDrawer(overrides: Partial<ComponentProps<typeof AnalyticsDrawer>> = {}) {
  return render(<AnalyticsDrawer {...baseProps} {...overrides} />);
}

describe('AnalyticsDrawer', () => {
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
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toHaveTextContent(
      'Monday, August 17 · ฿120',
    );
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

  it('keeps W M Q C on the right and opens the controlled custom range picker', async () => {
    renderDrawer({ range: 'custom' });

    const controls = screen.getByTestId('analytics-range-controls');
    expect(within(controls).getByRole('group', { name: 'Analytics range' })).toBeInTheDocument();
    expect(within(controls).getAllByRole('button')).toHaveLength(4);
    const picker = screen.getByRole('button', { name: /Custom date range, Aug 1 – Aug 17/ });
    expect(picker).toBeInTheDocument();
    await waitFor(() => expect(picker).toHaveAttribute('aria-expanded', 'true'));
  });

  it('resets drill-down when the analytics scope changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDrawer();
    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(screen.getByRole('button', { name: /Clear selected period filter/ })).toBeInTheDocument();

    rerender(<AnalyticsDrawer {...baseProps} range="month" />);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Clear selected period filter/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole('option').every((option) => option.getAttribute('aria-selected') === 'false')).toBe(
      true,
    );
  });

  it('shares range/currency controls and closes before editing a row', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onCurrencyChange = vi.fn();
    const onOpenChange = vi.fn();
    const onSelectTransaction = vi.fn();
    renderDrawer({
      onRangeChange,
      currency: 'THB',
      onCurrencyChange,
      currencies: ['THB', 'USD'],
      onOpenChange,
      onSelectTransaction,
    });

    await user.click(screen.getByRole('button', { name: 'Quarter, quarter to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('quarter');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Analytics currency' }), 'USD');
    expect(onCurrencyChange).toHaveBeenCalledWith('USD');
    await user.click(screen.getByRole('button', { name: /expense Dining Out/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectTransaction).toHaveBeenCalledWith(transactions[0]);
  });

  it('politely announces the selected period and recomputed expense total', async () => {
    const user = userEvent.setup();
    let selectedRange: AnalyticsRange = 'week';
    const { rerender } = render(
      <AnalyticsDrawer
        {...baseProps}
        range={selectedRange}
        onRangeChange={(range) => {
          selectedRange = range;
          rerender(<AnalyticsDrawer {...baseProps} range={selectedRange} />);
        }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('Week, last 7 days · Expenses ฿200');

    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    expect(status).toHaveTextContent('Month, month to date · Expenses ฿200');

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(status).toHaveTextContent(
      'Monday, August 17, ฿120 · Dining Out ฿120 · Income ฿0 · Net -฿120',
    );
  });

  it('announces loading without presenting a partial local total as complete', () => {
    renderDrawer({ isLoading: true, hasCompleteHistory: false });

    const status = screen.getByRole('status', { name: 'Analytics summary update' });
    expect(status).toHaveTextContent('Loading Week, last 7 days analytics');
    expect(status).not.toHaveTextContent('Expenses ฿200');
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
});
