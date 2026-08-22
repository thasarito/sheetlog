import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { TransactionHistoryDateHeader } from './TransactionHistoryItems';

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
    createdAt: '2026-08-17T12:00:00',
    updatedAt: '2026-08-17T12:00:00',
    ...overrides,
  };
}

function setNaturalOffset(
  element: HTMLElement,
  offsetParent: HTMLElement,
  offsetTop: number,
) {
  Object.defineProperties(element, {
    offsetParent: { configurable: true, get: () => offsetParent },
    offsetTop: { configurable: true, get: () => offsetTop },
  });
}

describe('useAutoStickyDateHeader', () => {
  it('reveals and hands off the Analytics daily net from natural scroll offsets', async () => {
    const computedStyle = vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ top: '68px' } as CSSStyleDeclaration);

    try {
      render(
        <div style={{ transform: 'translate3d(0, 0, 0)' }}>
          <div data-dashboard-scroll="true" data-testid="analytics-scroll">
            <TransactionHistoryDateHeader
              dateKey="2026-08-17"
              today={new Date(2026, 7, 17, 12)}
              transactions={[
                transaction('expense', { amount: 120 }),
                transaction('income', { type: 'income', amount: 500 }),
              ]}
              baseCurrency="THB"
              baseAmountStates={{}}
            />
            <TransactionHistoryDateHeader
              dateKey="2026-08-16"
              today={new Date(2026, 7, 17, 12)}
              transactions={[transaction('older', { amount: 50 })]}
              baseCurrency="THB"
              baseAmountStates={{}}
            />
          </div>
        </div>,
      );

      const scrollRoot = screen.getByTestId('analytics-scroll');
      const [currentHeader, previousHeader] = screen.getAllByTestId(
        'transaction-history-date-header',
      );
      if (!currentHeader || !previousHeader) {
        throw new Error('Expected two date headers');
      }

      setNaturalOffset(currentHeader, scrollRoot, 540);
      setNaturalOffset(previousHeader, scrollRoot, 740);

      scrollRoot.scrollTop = 472;
      fireEvent.scroll(scrollRoot);

      await waitFor(() =>
        expect(currentHeader).toHaveAttribute('data-sticky-state', 'pinned'),
      );
      expect(previousHeader).toHaveAttribute('data-sticky-state', 'resting');
      expect(
        within(currentHeader).getByTestId('daily-net-amount').parentElement,
      ).toHaveClass('opacity-100');

      scrollRoot.scrollTop = 672;
      fireEvent.scroll(scrollRoot);

      await waitFor(() =>
        expect(previousHeader).toHaveAttribute('data-sticky-state', 'pinned'),
      );
      expect(currentHeader).toHaveAttribute('data-sticky-state', 'resting');
      expect(
        within(previousHeader).getByTestId('daily-net-amount').parentElement,
      ).toHaveClass('opacity-100');
    } finally {
      computedStyle.mockRestore();
    }
  });
});
