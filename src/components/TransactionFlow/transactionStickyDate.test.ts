import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { flattenTransactionHistory } from './TransactionHistoryItems';
import { findStickyTransactionDateIndex } from './transactionStickyDate';

function transaction(
  id: string,
  date: string,
): TransactionRecord {
  return {
    id,
    type: 'expense',
    amount: 10,
    currency: 'THB',
    account: 'Wallet',
    for: 'Me',
    category: `Category ${id}`,
    date,
    status: 'synced',
    createdAt: date,
    updatedAt: date,
  };
}

describe('findStickyTransactionDateIndex', () => {
  const items = flattenTransactionHistory([
    transaction('new-a', '2026-08-17T12:00:00'),
    transaction('new-b', '2026-08-17T09:00:00'),
    transaction('old', '2026-08-16T08:00:00'),
  ]);
  const offsets = new Map([
    [0, 0],
    [1, 36],
    [2, 100],
    [3, 164],
    [4, 200],
  ]);
  const getOffset = (index: number) => offsets.get(index);

  it('shows no aggregate before the first date has pinned', () => {
    expect(
      findStickyTransactionDateIndex(items, 0, 0, getOffset),
    ).toBeNull();
  });

  it('keeps the current day pinned while its transaction rows scroll', () => {
    expect(findStickyTransactionDateIndex(items, 1, 36, getOffset)).toBe(0);
    expect(findStickyTransactionDateIndex(items, 2, 120, getOffset)).toBe(0);
  });

  it('switches to the next day when its date reaches the top', () => {
    expect(findStickyTransactionDateIndex(items, 3, 164, getOffset)).toBe(3);
    expect(findStickyTransactionDateIndex(items, 4, 220, getOffset)).toBe(3);
  });

  it('returns no sticky date when the virtualizer has no visible item', () => {
    expect(
      findStickyTransactionDateIndex(items, undefined, 120, getOffset),
    ).toBeNull();
  });
});
