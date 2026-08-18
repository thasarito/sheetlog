import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import type { AnalyticsViewProps } from './AnalyticsView';
import { HomeDashboardCarousel } from './HomeDashboardCarousel';
import type { TransactionHistoryViewProps } from './TransactionHistoryView';
import type { AnalyticsSyncController } from './useAnalyticsSync';

const transactionViewCalls: TransactionHistoryViewProps[] = [];
const analyticsViewCalls: AnalyticsViewProps[] = [];
let historyData: TransactionRecord[] = [];
let rateData: AnalyticsSyncController['rates'] = [];
const resync = vi.fn();

const historyRecords: TransactionRecord[] = [
  {
    id: 'older-expense',
    type: 'expense',
    amount: 100,
    currency: 'THB',
    account: 'Cash',
    for: 'Me',
    category: 'Dining Out',
    date: '2026-07-01T12:00:00',
    status: 'synced',
    sheetRowValid: true,
    createdAt: '2026-07-01T12:00:00',
    updatedAt: '2026-07-01T12:00:00',
  },
];

vi.mock('./TransactionHistoryView', () => ({
  TransactionHistoryView: (props: TransactionHistoryViewProps) => {
    transactionViewCalls.push(props);
    return (
      <section>
        <span>Full Transactions view</span>
        <button
          type="button"
          onClick={() => props.onEditTransaction(historyRecords[0])}
        >
          Select transaction row
        </button>
      </section>
    );
  },
}));

vi.mock('./AnalyticsView', () => ({
  AnalyticsView: (props: AnalyticsViewProps) => {
    analyticsViewCalls.push(props);
    return (
      <section>
        <span>Full Analytics view</span>
        <button type="button" onClick={() => props.onRangeChange('month')}>
          Test month range
        </button>
        <button type="button" onClick={() => props.onPeriodChange(-1)}>
          Test previous period
        </button>
        <button type="button" onClick={() => props.onRangeChange('quarter')}>
          Test quarter range
        </button>
        <button type="button" onClick={() => props.onRangeChange('year')}>
          Test year range
        </button>
        <button
          type="button"
          onClick={() => {
            props.onCustomPeriodChange({
              start: new Date(2026, 7, 5),
              end: new Date(2026, 7, 12),
            });
            props.onRangeChange('custom');
          }}
        >
          Apply test custom range
        </button>
        <button type="button" onClick={props.onNoBigSpendingToggle}>
          Toggle no big spending
        </button>
        <button
          type="button"
          onClick={() => props.onSelectTransaction(historyRecords[0])}
        >
          Select analytics row
        </button>
        <button type="button" data-home-carousel-swipe-lock="true">
          Nested period swipe target
        </button>
      </section>
    );
  },
}));

function renderCarousel({
  bigSpendingThreshold = null,
  onToast = vi.fn(),
  status = 'synced',
}: {
  bigSpendingThreshold?: number | null;
  onToast?: (message: string) => void;
  status?: AnalyticsSyncController['status'];
} = {}) {
  const onEditTransaction = vi.fn();
  const analyticsSync: AnalyticsSyncController = {
    history: {
      records: historyData,
      meta: null,
      error: null,
      hasCompleteCache: true,
      hasLocalSnapshot: true,
      isLoading: false,
      isRefreshing: false,
      isDownloading: false,
      isOnline: status !== 'offline',
      remoteStatus: 'success',
      remoteFetchedAt: undefined,
      remoteError: null,
      refresh: vi.fn(),
    },
    records: historyData,
    rates: rateData,
    hasLocalHistory: true,
    status,
    lastSyncedAt: '2026-08-17T12:00:00.000Z',
    isResyncing: false,
    resync,
  };
  render(
    <HomeDashboardCarousel
      baseCurrency="THB"
      bigSpendingThreshold={bigSpendingThreshold}
      analyticsSync={analyticsSync}
      onToast={onToast}
      onEditTransaction={onEditTransaction}
    />,
  );
  const viewport = screen.getByTestId('home-carousel-viewport');
  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(viewport, 'scrollTo', {
    configurable: true,
    value: ({ left }: ScrollToOptions) => {
      viewport.scrollLeft = Number(left ?? 0);
      fireEvent.scroll(viewport);
    },
  });
  return { analyticsSync, onEditTransaction, viewport };
}

async function openAnalytics() {
  fireEvent.keyDown(screen.getByTestId('home-carousel-viewport'), {
    key: 'ArrowRight',
  });
  await waitFor(() =>
    expect(
      screen.getByLabelText('Analytics, slide 2 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true'),
  );
}

describe('HomeDashboardCarousel', () => {
  beforeEach(() => {
    historyData = historyRecords;
    rateData = [];
    resync.mockReset();
    transactionViewCalls.splice(0);
    analyticsViewCalls.splice(0);
  });

  it('renders both full review views and no View all flow', () => {
    const { analyticsSync } = renderCarousel();

    expect(screen.getByText('Full Transactions view')).toBeInTheDocument();
    expect(screen.getByText('Full Analytics view')).toBeInTheDocument();
    expect(screen.queryByText(/View all/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: /Transactions|Analytics/ }),
    ).not.toBeInTheDocument();
    expect(transactionViewCalls.at(-1)?.history).toBe(analyticsSync.history);
  });

  it('starts on Transactions and keeps full review controls active while switching', async () => {
    const { viewport } = renderCarousel();
    const transactionSlide = screen.getByLabelText('Transactions, slide 1 of 2');
    const analyticsSlide = screen.getByLabelText('Analytics, slide 2 of 2');

    expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true');
    expect(analyticsSlide).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(analyticsSlide.inert).toBe(true));
    await openAnalytics();
    expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true');
    expect(transactionSlide).toHaveAttribute('aria-hidden', 'true');
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true'),
    );
    expect(resync).not.toHaveBeenCalled();
  });

  it('removes dot controls while keeping viewport keyboard navigation', async () => {
    const { viewport } = renderCarousel();
    const user = userEvent.setup();
    const transactionSlide = screen.getByLabelText('Transactions, slide 1 of 2');
    const analyticsSlide = screen.getByLabelText('Analytics, slide 2 of 2');

    expect(viewport).toHaveAttribute('tabindex', '0');
    viewport.focus();
    expect(viewport).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Transactions slide' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Analytics slide' }),
    ).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true');
      expect(transactionSlide).toHaveAttribute('aria-hidden', 'true');
    });
    expect(viewport).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true');
      expect(analyticsSlide).toHaveAttribute('aria-hidden', 'true');
    });
    expect(viewport).toHaveFocus();
  });

  it('snaps on touch swipes while leaving nested controls and mouse drags alone', async () => {
    const { viewport } = renderCarousel();
    expect(viewport.className).toContain('[touch-action:pan-y]');

    fireEvent.pointerDown(viewport, {
      pointerType: 'touch',
      clientX: 260,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 94,
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Analytics, slide 2 of 2'),
      ).not.toHaveAttribute('aria-hidden', 'true'),
    );

    const nestedTarget = screen.getByRole('button', {
      name: 'Nested period swipe target',
    });
    fireEvent.pointerDown(nestedTarget, {
      pointerType: 'touch',
      clientX: 100,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerType: 'touch',
      clientX: 260,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerType: 'touch',
      clientX: 260,
      clientY: 94,
    });
    expect(
      screen.getByLabelText('Analytics, slide 2 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true');

    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Transactions, slide 1 of 2'),
      ).not.toHaveAttribute('aria-hidden', 'true'),
    );
    fireEvent.pointerDown(viewport, {
      pointerType: 'mouse',
      clientX: 260,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerType: 'mouse',
      clientX: 100,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerType: 'mouse',
      clientX: 100,
      clientY: 94,
    });
    expect(
      screen.getByLabelText('Transactions, slide 1 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('suppresses a transaction action after a committed horizontal drag', () => {
    const { onEditTransaction, viewport } = renderCarousel();
    const trigger = screen.getByRole('button', { name: 'Select transaction row' });

    fireEvent.pointerDown(trigger, {
      clientX: 250,
      clientY: 80,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(viewport, {
      clientX: 120,
      clientY: 84,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(viewport, {
      clientX: 120,
      clientY: 84,
      pointerType: 'touch',
    });
    fireEvent.click(trigger);

    expect(onEditTransaction).not.toHaveBeenCalled();
  });

  it('builds month, quarter, year, custom, and shared period state', async () => {
    const user = userEvent.setup();
    renderCarousel();
    await openAnalytics();

    expect(analyticsViewCalls.at(-1)?.periodOptions.length).toBeGreaterThan(1);
    await user.click(screen.getByRole('button', { name: 'Test previous period' }));
    expect(analyticsViewCalls.at(-1)?.periodOffset).toBe(-1);

    await user.click(screen.getByRole('button', { name: 'Test month range' }));
    expect(analyticsViewCalls.at(-1)?.range).toBe('month');
    expect(analyticsViewCalls.at(-1)?.periodOffset).toBe(0);
    expect(
      analyticsViewCalls
        .at(-1)
        ?.summary?.buckets.every((bucket) => !bucket.key.endsWith('-week')),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Test quarter range' }));
    expect(analyticsViewCalls.at(-1)?.summary?.range).toBe('quarter');
    expect(
      analyticsViewCalls
        .at(-1)
        ?.summary?.buckets.every((bucket) => bucket.key.endsWith('-week')),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Test year range' }));
    expect(analyticsViewCalls.at(-1)?.summary?.range).toBe('year');
    expect(analyticsViewCalls.at(-1)?.summary?.periods.current.start.getMonth()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Apply test custom range' }));
    expect(analyticsViewCalls.at(-1)?.summary?.range).toBe('custom');
    expect(analyticsViewCalls.at(-1)?.customPeriod).toEqual({
      start: new Date(2026, 7, 5),
      end: new Date(2026, 7, 12),
    });
  });

  it('passes one converted base-currency summary to the detailed Analytics view', () => {
    const date = new Date().toISOString();
    const day = date.slice(0, 10);
    historyData = [
      {
        ...historyRecords[0],
        id: 'thb',
        date,
        createdAt: date,
        updatedAt: date,
      },
      {
        ...historyRecords[0],
        id: 'usd',
        amount: 3,
        currency: 'USD',
        category: 'Coffee',
        date,
        createdAt: date,
        updatedAt: date,
      },
    ];
    rateData = [
      {
        id: `THB:USD:${day}`,
        base: 'THB',
        quote: 'USD',
        date: day,
        rate: 0.03,
        fetchedAt: date,
      },
    ];

    renderCarousel();

    expect(analyticsViewCalls.at(-1)?.summary?.currency).toBe('THB');
    expect(analyticsViewCalls.at(-1)?.summary?.expenseTotal).toBe(200);
    expect(transactionViewCalls.at(-1)?.history.records).toBe(historyData);
  });

  it('filters the one detailed summary when no-big-spending mode is active', async () => {
    const user = userEvent.setup();
    const date = new Date().toISOString();
    historyData = [
      {
        ...historyRecords[0],
        id: 'ordinary',
        date,
        createdAt: date,
        updatedAt: date,
      },
      {
        ...historyRecords[0],
        id: 'large',
        amount: 10_000,
        category: 'Travel',
        date,
        createdAt: date,
        updatedAt: date,
      },
    ];
    renderCarousel({ bigSpendingThreshold: 10_000 });
    await openAnalytics();

    expect(analyticsViewCalls.at(-1)?.summary?.expenseTotal).toBe(10_100);
    await user.click(screen.getByRole('button', { name: 'Toggle no big spending' }));
    await waitFor(() => {
      expect(analyticsViewCalls.at(-1)?.noBigSpending).toBe(true);
      expect(analyticsViewCalls.at(-1)?.summary?.expenseTotal).toBe(100);
    });
    await user.click(screen.getByRole('button', { name: 'Toggle no big spending' }));
    await waitFor(() =>
      expect(analyticsViewCalls.at(-1)?.summary?.expenseTotal).toBe(10_100),
    );
  });

  it('directs an unconfigured no-big-spending press to Settings', async () => {
    const onToast = vi.fn();
    renderCarousel({ onToast });
    await openAnalytics();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Toggle no big spending' }));

    expect(onToast).toHaveBeenCalledWith(
      'Set a big spending cutoff in Settings.',
    );
    expect(analyticsViewCalls.at(-1)?.noBigSpending).toBe(false);
  });

  it('routes transaction selections from either full view to the shared editor', async () => {
    const user = userEvent.setup();
    const { onEditTransaction } = renderCarousel();

    await user.click(screen.getByRole('button', { name: 'Select transaction row' }));
    expect(onEditTransaction).toHaveBeenLastCalledWith(historyRecords[0]);
    await openAnalytics();
    await user.click(screen.getByRole('button', { name: 'Select analytics row' }));
    expect(onEditTransaction).toHaveBeenCalledTimes(2);
  });

  it('passes offline and refresh state through without starting another query', () => {
    const { analyticsSync } = renderCarousel({ status: 'offline' });

    expect(transactionViewCalls.at(-1)?.history).toBe(analyticsSync.history);
    expect(analyticsViewCalls.at(-1)?.isOffline).toBe(true);
    expect(analyticsViewCalls.at(-1)?.onRetry).toBe(resync);
    expect(resync).not.toHaveBeenCalled();
  });
});
