import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import {
  flattenTransactionHistory,
  TransactionHistoryDateHeader,
  TransactionHistoryRow,
} from './TransactionHistoryItems';

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: 'expense',
    amount: 10,
    currency: 'THB',
    account: 'Wallet',
    for: 'Me',
    category: `Category ${id}`,
    date: '2026-08-17T12:00:00',
    status: 'synced',
    sheetId: 'sheet-a',
    sheetRow: 2,
    sheetRowValid: true,
    createdAt: '2026-08-17T12:00:00',
    updatedAt: '2026-08-17T12:00:00',
    ...overrides,
  };
}

describe('TransactionHistoryItems', () => {
  it('flattens sorted transactions into one header per local calendar day', () => {
    const items = flattenTransactionHistory([
      transaction('new-a', { date: '2026-08-17T12:00:00' }),
      transaction('new-b', { date: '2026-08-17T09:00:00' }),
      transaction('old', { date: '2026-08-16T08:00:00' }),
    ]);

    expect(items.map((item) => item.key)).toEqual([
      'date:2026-08-17',
      'transaction:new-a',
      'transaction:new-b',
      'date:2026-08-16',
      'transaction:old',
    ]);
    const dateItems = items.filter((item) => item.kind === 'date');
    expect(dateItems.map((item) => item.transactions.map(({ id }) => id))).toEqual([
      ['new-a', 'new-b'],
      ['old'],
    ]);
  });

  it('uses the same relative and calendar day labels in both sheets', () => {
    const today = new Date(2026, 7, 17, 12);
    const baseAmountStates = {};
    render(
      <>
        <TransactionHistoryDateHeader
          mode="static"
          dateKey="2026-08-17"
          today={today}
          transactions={[]}
          baseCurrency="THB"
          baseAmountStates={baseAmountStates}
        />
        <TransactionHistoryDateHeader
          mode="static"
          dateKey="2026-08-16"
          today={today}
          transactions={[]}
          baseCurrency="THB"
          baseAmountStates={baseAmountStates}
        />
        <TransactionHistoryDateHeader
          mode="static"
          dateKey="2026-08-15"
          today={today}
          transactions={[]}
          baseCurrency="THB"
          baseAmountStates={baseAmountStates}
        />
      </>,
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Saturday, Aug 15')).toBeInTheDocument();
  });

  it('reserves the daily net slot but reveals it only while pinned', () => {
    const rows = [
      transaction('expense', { amount: 120 }),
      transaction('income', { type: 'income', amount: 500 }),
      transaction('transfer', { type: 'transfer', amount: 900 }),
    ];

    render(
      <>
        <div data-testid="resting-date">
          <TransactionHistoryDateHeader
            mode="static"
            dateKey="2026-08-17"
            today={new Date(2026, 7, 17, 12)}
            transactions={rows}
            baseCurrency="THB"
            baseAmountStates={{}}
          />
        </div>
        <div data-testid="pinned-date">
          <TransactionHistoryDateHeader
            mode="pinned"
            dateKey="2026-08-17"
            today={new Date(2026, 7, 17, 12)}
            transactions={rows}
            baseCurrency="THB"
            baseAmountStates={{}}
          />
        </div>
      </>,
    );

    const resting = within(screen.getByTestId('resting-date'));
    const restingHeader = resting.getByTestId(
      'transaction-history-date-header',
    );
    const restingAmount = resting.getByTestId('daily-net-amount');
    expect(restingHeader).toHaveAttribute('data-sticky-state', 'resting');
    expect(restingAmount.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(restingAmount.parentElement).toHaveClass('min-w-16', 'opacity-0');

    const pinned = within(screen.getByTestId('pinned-date'));
    const pinnedHeader = pinned.getByTestId('transaction-history-date-header');
    const pinnedAmount = pinned.getByTestId('daily-net-amount');
    expect(pinnedHeader).toHaveAttribute('data-sticky-state', 'pinned');
    expect(pinnedHeader).toHaveClass('border-border/70', 'bg-background/95');
    expect(pinnedAmount.parentElement).not.toHaveAttribute('aria-hidden');
    expect(pinnedAmount.parentElement).toHaveClass('opacity-100');
    expect(pinnedAmount).toHaveTextContent('+฿380');
    expect(
      pinned.getByText('Daily net plus 380.00 THB'),
    ).toBeInTheDocument();
  });

  it('shares signed amounts, statuses, editability, and selection behavior', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const expense = transaction('expense', { amount: 120 });
    const pending = transaction('pending', { status: 'pending' });
    const failed = transaction('failed', {
      status: 'error',
      error: 'Network unavailable',
    });
    const legacy = transaction('legacy', { sheetRowValid: false });

    render(
      <>
        <TransactionHistoryRow transaction={expense} onSelect={onSelect} />
        <TransactionHistoryRow transaction={pending} onSelect={onSelect} />
        <TransactionHistoryRow transaction={failed} onSelect={onSelect} />
        <TransactionHistoryRow transaction={legacy} onSelect={onSelect} />
      </>,
    );

    expect(screen.getByText('−฿120.00')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /expense Category legacy.*Read only/,
      }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('button', {
        name: /expense Category expense.*Wallet.*−฿120.00/,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(expense);
  });

  it('adds a quiet accessible approximation only to foreign-currency rows', () => {
    const onSelect = vi.fn();
    const base = transaction('base');
    const ready = transaction('ready', { currency: 'USD' });
    const income = transaction('income', {
      type: 'income',
      currency: 'USD',
    });
    const loading = transaction('loading', { currency: 'USD' });
    const unavailable = transaction('unavailable', { currency: 'USD' });

    render(
      <>
        <TransactionHistoryRow transaction={base} onSelect={onSelect} />
        <TransactionHistoryRow
          transaction={ready}
          onSelect={onSelect}
          baseAmount={{ status: 'ready', currency: 'THB', amount: 100 }}
        />
        <TransactionHistoryRow
          transaction={income}
          onSelect={onSelect}
          baseAmount={{ status: 'ready', currency: 'THB', amount: 100 }}
        />
        <TransactionHistoryRow
          transaction={loading}
          onSelect={onSelect}
          baseAmount={{ status: 'loading', currency: 'THB' }}
        />
        <TransactionHistoryRow
          transaction={unavailable}
          onSelect={onSelect}
          baseAmount={{ status: 'unavailable', currency: 'THB' }}
        />
      </>,
    );

    expect(screen.getByText('≈ −฿100.00')).toHaveClass(
      'text-muted-foreground',
    );
    expect(screen.getByText('≈ +฿100.00')).toBeInTheDocument();
    expect(screen.getByText('≈ ฿—')).toBeInTheDocument();
    expect(
      screen.getByTestId('base-currency-amount-loading'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Category ready.*approximately minus 100\.00 THB/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: /Category unavailable.*base amount unavailable in THB/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Category base/ }),
    ).not.toHaveTextContent('≈');
  });
});
