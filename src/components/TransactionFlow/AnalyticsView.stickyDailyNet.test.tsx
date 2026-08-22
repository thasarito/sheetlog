import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import {
  buildAnalyticsSummary,
  type AnalyticsPeriodOption,
  type DatePeriod,
} from './analytics';
import { AnalyticsView } from './AnalyticsView';

const now = new Date(2026, 7, 19, 12);
const customPeriod: DatePeriod = {
  start: new Date(2026, 7, 17),
  end: new Date(2026, 7, 19, 23, 59, 59, 999),
};
const periodOptions: AnalyticsPeriodOption[] = [
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

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  const date = overrides.date ?? '2026-08-19T12:00:00';
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
    sheetRowValid: true,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

const transactions = [
  transaction('today-income', { type: 'income', amount: 500 }),
  transaction('today-expense', { amount: 120, date: '2026-08-19T10:00:00' }),
  transaction('yesterday-expense', {
    amount: 50,
    date: '2026-08-18T18:00:00',
  }),
];

function buildSummary() {
  const result = buildAnalyticsSummary({
    transactions,
    range: 'week',
    baseCurrency: 'THB',
    rates: [],
    now,
    customPeriod,
    periodOffset: 0,
  });
  if (result.status !== 'ready') throw new Error('Expected ready analytics');
  return result.summary;
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

describe('AnalyticsView sticky daily net', () => {
  it('uses one pinned overlay instead of overlapping in-flow sticky dates', async () => {
    render(
      <AnalyticsView
        transactions={transactions}
        summary={buildSummary()}
        baseCurrency="THB"
        bigSpendingThreshold={null}
        noBigSpending={false}
        onNoBigSpendingToggle={vi.fn()}
        range="week"
        onRangeChange={vi.fn()}
        periodOptions={periodOptions}
        periodOffset={0}
        onPeriodChange={vi.fn()}
        customPeriod={customPeriod}
        onCustomPeriodChange={vi.fn()}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={now}
      />,
    );

    const scroll = screen.getByTestId('analytics-dashboard-scroll');
    scroll.style.setProperty('--dashboard-header-space', '0px');
    const transactionSection = screen.getByRole('region', {
      name: 'Transactions',
    });
    const inFlowHeaders = within(transactionSection).getAllByTestId(
      'transaction-history-date-header',
    );
    expect(inFlowHeaders).toHaveLength(2);
    for (const header of inFlowHeaders) {
      expect(header).toHaveAttribute('data-sticky-state', 'resting');
      expect(header).not.toHaveClass('sticky');
    }

    const overlay = screen.getByTestId(
      'analytics-transaction-sticky-date-header',
    );
    expect(overlay).not.toHaveAttribute('data-sticky-date-key');

    const [todayHeader, yesterdayHeader] = inFlowHeaders;
    if (!todayHeader || !yesterdayHeader) {
      throw new Error('Expected two date headers');
    }
    setNaturalOffset(todayHeader, scroll, 400);
    setNaturalOffset(yesterdayHeader, scroll, 650);

    scroll.scrollTop = 400;
    fireEvent.scroll(scroll);

    await waitFor(() =>
      expect(overlay).toHaveAttribute('data-sticky-date-key', '2026-08-19'),
    );
    expect(within(overlay).getByText('Today')).toBeInTheDocument();
    expect(within(overlay).getByTestId('daily-net-amount')).toHaveTextContent(
      '+฿380',
    );
    expect(
      screen.getAllByTestId('transaction-history-date-header').filter(
        (header) => header.dataset.stickyState === 'pinned',
      ),
    ).toHaveLength(1);

    scroll.scrollTop = 650;
    fireEvent.scroll(scroll);

    await waitFor(() =>
      expect(overlay).toHaveAttribute('data-sticky-date-key', '2026-08-18'),
    );
    expect(within(overlay).getByText('Yesterday')).toBeInTheDocument();
    expect(within(overlay).getByTestId('daily-net-amount')).toHaveTextContent(
      '−฿50',
    );
    for (const header of inFlowHeaders) {
      expect(header).toHaveAttribute('data-sticky-state', 'resting');
      expect(header).not.toHaveClass('sticky');
    }
  });
});
