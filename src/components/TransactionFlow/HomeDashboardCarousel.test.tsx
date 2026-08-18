import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import type { DashboardHeaderMotionHandle } from '../Header';
import type { AnalyticsViewProps } from './AnalyticsView';
import { HomeDashboardCarousel } from './HomeDashboardCarousel';
import type { TransactionHistoryViewProps } from './TransactionHistoryView';
import type { AnalyticsSyncController } from './useAnalyticsSync';

const emblaHarness = vi.hoisted(() => ({
  api: null as null | {
    emit: (name: string) => unknown;
    reInit: () => void;
    scrollNext: () => void;
    scrollPrev: () => void;
  },
  slideOffsets: [0, 300] as [number, number],
}));

vi.mock('embla-carousel-react', async () => {
  const React = await import('react');
  return {
    default: function useFakeEmbla() {
      const [viewport, setViewport] = React.useState<HTMLElement | null>(null);
      const api = React.useMemo(() => {
        const listeners = new Map<string, Set<(api: unknown) => void>>();
        let selected = 0;
        let root: HTMLElement | null = null;
        const emit = (name: string) => {
          for (const listener of listeners.get(name) ?? []) listener(fakeApi);
        };
        const select = (next: number) => {
          selected = (next + 2) % 2;
          emblaHarness.slideOffsets =
            selected === 0 ? [0, 300] : [-300, 0];
          emit('scroll');
          emit('select');
          emit('settle');
        };
        const fakeApi = {
          canScrollNext: () => true,
          canScrollPrev: () => true,
          containerNode: () => root?.firstElementChild as HTMLElement,
          destroy: () => undefined,
          emit(name: string) {
            emit(name);
            return fakeApi;
          },
          internalEngine: () => ({}),
          off(name: string, listener: (api: unknown) => void) {
            listeners.get(name)?.delete(listener);
            return fakeApi;
          },
          on(name: string, listener: (api: unknown) => void) {
            const callbacks = listeners.get(name) ?? new Set();
            callbacks.add(listener);
            listeners.set(name, callbacks);
            return fakeApi;
          },
          plugins: () => ({}),
          previousScrollSnap: () => (selected + 1) % 2,
          reInit: () => emit('reInit'),
          rootNode: () => root as HTMLElement,
          scrollNext: () => select(selected + 1),
          scrollPrev: () => select(selected - 1),
          scrollProgress: () => selected,
          scrollSnapList: () => [0, 1],
          scrollTo: (index: number) => select(index),
          selectedScrollSnap: () => selected,
          slideNodes: () =>
            Array.from(
              root?.querySelectorAll<HTMLElement>(
                '[data-home-carousel-slide-index]',
              ) ?? [],
            ),
          slidesInView: () => [selected],
          slidesNotInView: () => [(selected + 1) % 2],
          setRoot(nextRoot: HTMLElement) {
            root = nextRoot;
          },
        };
        return fakeApi;
      }, []);
      React.useEffect(() => {
        if (!viewport) return;
        api.setRoot(viewport);
        emblaHarness.api = api;
        return () => {
          if (emblaHarness.api === api) emblaHarness.api = null;
        };
      }, [api, viewport]);
      return [setViewport, viewport ? api : undefined] as const;
    },
  };
});

const transactionViewCalls: TransactionHistoryViewProps[] = [];
const analyticsViewCalls: AnalyticsViewProps[] = [];
type DockMotionHandle = {
  setMotion: (motion: {
    x: number;
    viewportWidth: number;
    interactive: boolean;
    moving: boolean;
  }) => void;
};
const dockMotion: DockMotionHandle = { setMotion: vi.fn() };
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
    const motionRef = (
      props as TransactionHistoryViewProps & {
        dockMotionRef?: { current: DockMotionHandle | null };
      }
    ).dockMotionRef;
    if (motionRef) motionRef.current = dockMotion;
    return (
      <section
        data-testid="transaction-history-scroll"
        data-dashboard-scroll="true"
      >
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function mockCarouselRect(this: HTMLElement) {
      const viewportLeft = 40;
      const slideIndex = Number(this.dataset.homeCarouselSlideIndex);
      const left = Number.isInteger(slideIndex)
        ? viewportLeft + emblaHarness.slideOffsets[slideIndex]
        : this.dataset.testid === 'home-carousel-viewport'
          ? viewportLeft
          : 0;
      const width =
        Number.isInteger(slideIndex) ||
        this.dataset.testid === 'home-carousel-viewport'
          ? 300
          : 0;
      return {
        bottom: 600,
        height: 600,
        left,
        right: left + width,
        top: 0,
        width,
        x: left,
        y: 0,
        toJSON: () => ({}),
      };
    },
  );
  const onEditTransaction = vi.fn();
  const headerMotion: DashboardHeaderMotionHandle = {
    setHorizontalMotion: vi.fn(),
    setVerticalProgress: vi.fn(),
  };
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
      headerMotionRef={{ current: headerMotion }}
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
  return { analyticsSync, headerMotion, onEditTransaction, viewport };
}

async function openTransactions() {
  fireEvent.keyDown(screen.getByTestId('home-carousel-viewport'), {
    key: 'ArrowRight',
  });
  await waitFor(() =>
    expect(
      screen.getByLabelText('Transactions, slide 2 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true'),
  );
}

function touchDrag(
  viewport: HTMLElement,
  target: HTMLElement,
  startX: number,
  endX: number,
) {
  const start = { clientX: startX, clientY: 90, identifier: 0 };
  const end = { clientX: endX, clientY: 94, identifier: 0 };
  fireEvent.pointerDown(target, {
    pointerType: 'touch',
    clientX: startX,
    clientY: 90,
  });
  fireEvent.touchStart(target, { touches: [start] });
  fireEvent.pointerMove(viewport, {
    pointerType: 'touch',
    clientX: endX,
    clientY: 94,
  });
  fireEvent.touchMove(document, { touches: [end] });
  fireEvent.touchEnd(document, { changedTouches: [end], touches: [] });
  fireEvent.pointerUp(viewport, {
    pointerType: 'touch',
    clientX: endX,
    clientY: 94,
  });
  if (!target.closest('[data-home-carousel-swipe-lock="true"]')) {
    act(() => {
      if (endX < startX) emblaHarness.api?.scrollNext();
      else emblaHarness.api?.scrollPrev();
    });
  }
}

describe('HomeDashboardCarousel', () => {
  beforeEach(() => {
    historyData = historyRecords;
    rateData = [];
    resync.mockReset();
    transactionViewCalls.splice(0);
    analyticsViewCalls.splice(0);
    emblaHarness.slideOffsets = [0, 300];
    vi.mocked(dockMotion.setMotion).mockReset();
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

  it('starts on Analytics and keeps full review controls active while switching', async () => {
    const { viewport } = renderCarousel();
    const analyticsSlide = screen.getByLabelText('Analytics, slide 1 of 2');
    const transactionSlide = screen.getByLabelText('Transactions, slide 2 of 2');

    expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true');
    expect(transactionSlide).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(transactionSlide.inert).toBe(true));
    await openTransactions();
    expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true');
    expect(analyticsSlide).toHaveAttribute('aria-hidden', 'true');
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true'),
    );
    expect(resync).not.toHaveBeenCalled();
  });

  it('tracks the Transactions slide through motion, reversal, settle, and reInit', async () => {
    renderCarousel();

    await waitFor(() =>
      expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
        x: 300,
        viewportWidth: 300,
        interactive: false,
        moving: false,
      }),
    );

    emblaHarness.slideOffsets = [-175, 125];
    act(() => {
      emblaHarness.api?.emit('scroll');
    });
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 125,
      viewportWidth: 300,
      interactive: false,
      moving: true,
    });

    emblaHarness.slideOffsets = [175, -125];
    act(() => {
      emblaHarness.api?.emit('scroll');
    });
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: -125,
      viewportWidth: 300,
      interactive: false,
      moving: true,
    });

    await openTransactions();
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 0,
      viewportWidth: 300,
      interactive: true,
      moving: false,
    });

    emblaHarness.slideOffsets = [-440, -140];
    act(() => {
      emblaHarness.api?.emit('scroll');
    });
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: -140,
      viewportWidth: 300,
      interactive: false,
      moving: true,
    });

    emblaHarness.slideOffsets = [-300, 0];
    act(() => {
      emblaHarness.api?.emit('settle');
      emblaHarness.api?.reInit();
    });
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 0,
      viewportWidth: 300,
      interactive: true,
      moving: false,
    });
  });

  it('collapses the header over 68px regardless of virtual content height', async () => {
    const { headerMotion } = renderCarousel();
    await openTransactions();
    const scroll = screen.getByTestId('transaction-history-scroll');
    const transactionSlide = screen.getByLabelText(
      'Transactions, slide 2 of 2',
    );
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 6_800 },
      scrollTop: { configurable: true, value: 34, writable: true },
    });
    vi.mocked(headerMotion.setVerticalProgress).mockClear();
    expect(transactionSlide).toHaveStyle({
      '--dashboard-header-space': '68px',
    });

    fireEvent.scroll(scroll);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
    expect(transactionSlide).toHaveStyle({
      '--dashboard-header-space': '34px',
    });

    scroll.scrollTop = 68;
    fireEvent.scroll(scroll);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(1);
    expect(transactionSlide).toHaveStyle({
      '--dashboard-header-space': '0px',
    });
  });

  it('removes dot controls while keeping viewport keyboard navigation', async () => {
    const { viewport } = renderCarousel();
    const user = userEvent.setup();
    const analyticsSlide = screen.getByLabelText('Analytics, slide 1 of 2');
    const transactionSlide = screen.getByLabelText('Transactions, slide 2 of 2');

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
      expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true');
      expect(analyticsSlide).toHaveAttribute('aria-hidden', 'true');
    });
    expect(viewport).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true');
      expect(transactionSlide).toHaveAttribute('aria-hidden', 'true');
    });
    expect(viewport).toHaveFocus();
  });

  it('loops keyboard navigation in both directions from either slide', async () => {
    const { viewport } = renderCarousel();
    const analyticsSlide = screen.getByLabelText('Analytics, slide 1 of 2');
    const transactionSlide = screen.getByLabelText('Transactions, slide 2 of 2');

    viewport.focus();
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true'),
    );

    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true'),
    );

    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true'),
    );
    expect(viewport).toHaveFocus();
  });

  it('snaps on touch swipes while leaving nested controls and mouse drags alone', async () => {
    const { viewport } = renderCarousel();
    expect(viewport.className).toContain('[touch-action:pan-y]');

    const nestedTarget = screen.getByRole('button', {
      name: 'Nested period swipe target',
    });
    touchDrag(viewport, nestedTarget, 100, 260);
    expect(
      screen.getByLabelText('Analytics, slide 1 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true');

    touchDrag(viewport, viewport, 260, 100);
    await waitFor(() =>
      expect(
        screen.getByLabelText('Transactions, slide 2 of 2'),
      ).not.toHaveAttribute('aria-hidden', 'true'),
    );

    touchDrag(viewport, viewport, 100, 260);
    await waitFor(() =>
      expect(
        screen.getByLabelText('Analytics, slide 1 of 2'),
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
      screen.getByLabelText('Analytics, slide 1 of 2'),
    ).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('suppresses a transaction action after a committed horizontal drag', async () => {
    const { onEditTransaction, viewport } = renderCarousel();
    await openTransactions();
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

    await user.click(screen.getByRole('button', { name: 'Select analytics row' }));
    expect(onEditTransaction).toHaveBeenLastCalledWith(historyRecords[0]);
    await openTransactions();
    await user.click(screen.getByRole('button', { name: 'Select transaction row' }));
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
