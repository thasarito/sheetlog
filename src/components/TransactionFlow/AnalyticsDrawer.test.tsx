import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { AnalyticsDrawer } from './AnalyticsDrawer';

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
    createdAt: '2026-08-15T12:00:00',
    updatedAt: '2026-08-15T12:00:00',
  },
];

describe('AnalyticsDrawer', () => {
  it('shows overview metrics and drills into a category', async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={transactions}
        range="week"
        onRangeChange={vi.fn()}
        currency="THB"
        onCurrencyChange={vi.fn()}
        currencies={['THB']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Analytics' })).toHaveFocus());
    expect(screen.getByText('฿200')).toBeInTheDocument();
    expect(screen.getByText('฿500')).toBeInTheDocument();
    expect(screen.getByText('฿300')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filter by Dining Out' }));
    expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Coffee/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear analytics filter' }));
    expect(screen.getByRole('button', { name: /expense Coffee/ })).toBeInTheDocument();
  });

  it('shares range/currency controls and closes before editing a row', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onCurrencyChange = vi.fn();
    const onOpenChange = vi.fn();
    const onSelectTransaction = vi.fn();
    render(
      <AnalyticsDrawer
        open
        onOpenChange={onOpenChange}
        transactions={transactions}
        range="week"
        onRangeChange={onRangeChange}
        currency="THB"
        onCurrencyChange={onCurrencyChange}
        currencies={['THB', 'USD']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={onSelectTransaction}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

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
    let selectedRange: 'week' | 'month' | 'quarter' = 'week';
    const { rerender } = render(
      <AnalyticsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={transactions}
        range={selectedRange}
        onRangeChange={(range) => {
          selectedRange = range;
          rerender(
            <AnalyticsDrawer
              open
              onOpenChange={vi.fn()}
              transactions={transactions}
              range={selectedRange}
              onRangeChange={vi.fn()}
              currency="THB"
              onCurrencyChange={vi.fn()}
              currencies={['THB']}
              isLoading={false}
              hasCompleteHistory
              isOffline={false}
              error={null}
              onRetry={vi.fn()}
              onSelectTransaction={vi.fn()}
              now={new Date(2026, 7, 17, 12)}
            />,
          );
        }}
        currency="THB"
        onCurrencyChange={vi.fn()}
        currencies={['THB']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('Week, last 7 days · Expenses ฿200');

    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    expect(status).toHaveTextContent('Month, month to date · Expenses ฿200');
  });

  it('announces loading without presenting a partial local total as complete', () => {
    render(
      <AnalyticsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={transactions}
        range="week"
        onRangeChange={vi.fn()}
        currency="THB"
        onCurrencyChange={vi.fn()}
        currencies={['THB']}
        isLoading
        hasCompleteHistory={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    const status = screen.getByRole('status', { name: 'Analytics summary update' });
    expect(status).toHaveTextContent('Loading Week, last 7 days analytics');
    expect(status).not.toHaveTextContent('Expenses ฿200');
  });

  it('groups categories after the top five into a selectable Other row', async () => {
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
        createdAt: '2026-08-17T12:00:00',
        updatedAt: '2026-08-17T12:00:00',
      }),
    );
    render(
      <AnalyticsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={manyCategories}
        range="week"
        onRangeChange={vi.fn()}
        currency="THB"
        onCurrencyChange={vi.fn()}
        currencies={['THB']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Filter by Other' }));
    expect(screen.getByRole('button', { name: /expense Category F/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Category G/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Category A/ })).not.toBeInTheDocument();
  });
});
