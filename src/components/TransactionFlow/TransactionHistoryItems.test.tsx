import { render, screen } from '@testing-library/react';
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
  });

  it('uses the same relative and calendar day labels in both sheets', () => {
    const today = new Date(2026, 7, 17, 12);
    render(
      <>
        <TransactionHistoryDateHeader dateKey="2026-08-17" today={today} />
        <TransactionHistoryDateHeader dateKey="2026-08-16" today={today} />
        <TransactionHistoryDateHeader dateKey="2026-08-15" today={today} />
      </>,
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Saturday, Aug 15')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /expense Category legacy.*Read only/ })).toBeDisabled();

    await user.click(
      screen.getByRole('button', {
        name: /expense Category expense.*Wallet.*−฿120.00/,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(expense);
  });
});
