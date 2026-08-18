import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import type { DashboardHeaderMotionHandle } from '../Header';
import type { SettingsViewProps } from '../SettingsView';
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
  slideOffsets: [0, 300, 600] as [number, number, number],
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
          selected = ((next % 3) + 3) % 3;
          emblaHarness.slideOffsets =
            selected === 0
              ? [0, 300, 600]
              : selected === 1
                ? [-300, 0, 300]
                : [-600, -300, 0];
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
          previousScrollSnap: () => (selected + 2) % 3,
          reInit: () => emit('reInit'),
          rootNode: () => root as HTMLElement,
          scrollNext: () => select(selected + 1),
          scrollPrev: () => select(selected - 1),
          scrollProgress: () => selected,
          scrollSnapList: () => [0, 1, 2],
          scrollTo: (index: number) => select(index),
          selectedScrollSnap: () => selected,
          slideNodes: () =>
            Array.from(
              root?.querySelectorAll<HTMLElement>('[data-home-carousel-slide-index]') ?? [],
            ),
          slidesInView: () => [selected],
          slidesNotInView: () => [0, 1, 2].filter((index) => index !== selected),
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
const settingsViewCalls: SettingsViewProps[] = [];
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
      <section data-testid="transaction-history-scroll" data-dashboard-scroll="true">
        <span>Full Transactions view</span>
        <button type="button" onClick={() => props.onEditTransaction(historyRecords[0])}>
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
        <button type="button" onClick={() => props.onSelectTransaction(historyRecords[0])}>
          Select analytics row
        </button>
        <button type="button" data-home-carousel-swipe-lock="true">
          Nested period swipe target
        </button>
      </section>
    );
  },
}));

vi.mock('../SettingsView', () => ({
  SettingsView: (props: SettingsViewProps) => {
    settingsViewCalls.push(props);
    return (
      <section data-testid="settings-scroll" data-dashboard-scroll="true">
        <span>Full Settings view</span>
        <input aria-label="Settings draft" defaultValue="" />
        <button type="button" data-home-carousel-swipe-lock="true">
          Settings swipe target
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
        Number.isInteger(slideIndex) || this.dataset.testid === 'home-carousel-viewport'
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
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 300 });
  return { analyticsSync, headerMotion, onEditTransaction, viewport };
}

async function openTransactions() {
  fireEvent.keyDown(screen.getByTestId('home-carousel-viewport'), { key: 'ArrowRight' });
  await waitFor(() =>
    expect(screen.getByLabelText('Transactions, slide 2 of 3')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    ),
  );
}

async function openSettings() {
  fireEvent.keyDown(screen.getByTestId('home-carousel-viewport'), { key: 'ArrowLeft' });
  await waitFor(() =>
    expect(screen.getByLabelText('Settings, slide 3 of 3')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    ),
  );
}

function touchDrag(
  viewport: HTMLElement,
  target: HTMLElement,
  startX: number,
  endX: number,
) {
  fireEvent.pointerDown(target, {
    pointerType: 'touch',
    clientX: startX,
    clientY: 90,
  });
  fireEvent.pointerMove(viewport, {
    pointerType: 'touch',
    clientX: endX,
    clientY: 94,
  });
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
    settingsViewCalls.splice(0);
    emblaHarness.slideOffsets = [0, 300, 600];
    vi.mocked(dockMotion.setMotion).mockReset();
  });

  it('renders Analytics, Transactions, and Settings in exact carousel order', async () => {
    const { analyticsSync } = renderCarousel();
    const analyticsSlide = screen.getByLabelText('Analytics, slide 1 of 3');
    const transactionSlide = screen.getByLabelText('Transactions, slide 2 of 3');
    const settingsSlide = screen.getByLabelText('Settings, slide 3 of 3');

    expect(screen.getByText('Full Analytics view')).toBeInTheDocument();
    expect(screen.getByText('Full Transactions view')).toBeInTheDocument();
    expect(screen.getByText('Full Settings view')).toBeInTheDocument();
    expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true');
    expect(transactionSlide).toHaveAttribute('aria-hidden', 'true');
    expect(settingsSlide).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => {
      expect(transactionSlide.inert).toBe(true);
      expect(settingsSlide.inert).toBe(true);
    });
    expect(transactionViewCalls.at(-1)?.history).toBe(analyticsSync.history);
    expect(settingsViewCalls.at(-1)?.analyticsSync).toBe(analyticsSync);
    expect(screen.queryByText(/View all/i)).not.toBeInTheDocument();
  });

  it('loops keyboard navigation through all three slides without moving focus', async () => {
    const { viewport } = renderCarousel();
    const analyticsSlide = screen.getByLabelText('Analytics, slide 1 of 3');
    const transactionSlide = screen.getByLabelText('Transactions, slide 2 of 3');
    const settingsSlide = screen.getByLabelText('Settings, slide 3 of 3');

    viewport.focus();
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() => expect(settingsSlide).not.toHaveAttribute('aria-hidden', 'true'));
    expect(viewport).toHaveFocus();

    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() => expect(analyticsSlide).not.toHaveAttribute('aria-hidden', 'true'));
    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() => expect(transactionSlide).not.toHaveAttribute('aria-hidden', 'true'));
    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() => expect(settingsSlide).not.toHaveAttribute('aria-hidden', 'true'));
    expect(viewport).toHaveFocus();
  });

  it('tracks the Transactions dock at index 1 through motion and settle', async () => {
    renderCarousel();
    await waitFor(() =>
      expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
        x: 300,
        viewportWidth: 300,
        interactive: false,
        moving: false,
      }),
    );

    emblaHarness.slideOffsets = [-175, 125, 425];
    act(() => emblaHarness.api?.emit('scroll'));
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 125,
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

    fireEvent.keyDown(screen.getByTestId('home-carousel-viewport'), { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByLabelText('Settings, slide 3 of 3')).not.toHaveAttribute(
        'aria-hidden',
        'true',
      ),
    );
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: -300,
      viewportWidth: 300,
      interactive: false,
      moving: false,
    });
  });

  it('keeps independent Settings scroll progress and restores it after slide changes', async () => {
    const { headerMotion, viewport } = renderCarousel();
    await openSettings();
    const settingsSlide = screen.getByLabelText('Settings, slide 3 of 3');
    const settingsScroll = screen.getByTestId('settings-scroll');
    Object.defineProperty(settingsScroll, 'scrollTop', {
      configurable: true,
      value: 34,
      writable: true,
    });
    vi.mocked(headerMotion.setVerticalProgress).mockClear();

    fireEvent.scroll(settingsScroll);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
    expect(settingsSlide).toHaveStyle({ '--dashboard-header-space': '34px' });

    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByLabelText('Analytics, slide 1 of 3')).not.toHaveAttribute(
        'aria-hidden',
        'true',
      ),
    );
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() => expect(settingsSlide).not.toHaveAttribute('aria-hidden', 'true'));
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
  });

  it('keeps the mounted Settings draft while leaving and returning to the slide', async () => {
    const user = userEvent.setup();
    const { viewport } = renderCarousel();
    await openSettings();
    const draft = screen.getByRole('textbox', { name: 'Settings draft' });
    await user.type(draft, 'Travel wallet');

    viewport.focus();
    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByLabelText('Analytics, slide 1 of 3')).not.toHaveAttribute(
        'aria-hidden',
        'true',
      ),
    );
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByLabelText('Settings, slide 3 of 3')).not.toHaveAttribute(
        'aria-hidden',
        'true',
      ),
    );
    expect(draft).toHaveValue('Travel wallet');
  });

  it('leaves nested horizontal gestures with their Settings owner', async () => {
    const { viewport } = renderCarousel();
    await openSettings();
    const locked = screen.getByRole('button', { name: 'Settings swipe target' });
    touchDrag(viewport, locked, 260, 100);
    expect(screen.getByLabelText('Settings, slide 3 of 3')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('snaps on ordinary touch swipes while leaving nested analytics gestures alone', async () => {
    const { viewport } = renderCarousel();
    const nestedTarget = screen.getByRole('button', { name: 'Nested period swipe target' });
    touchDrag(viewport, nestedTarget, 100, 260);
    expect(screen.getByLabelText('Analytics, slide 1 of 3')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    );

    touchDrag(viewport, viewport, 260, 100);
    await waitFor(() =>
      expect(screen.getByLabelText('Transactions, slide 2 of 3')).not.toHaveAttribute(
        'aria-hidden',
        'true',
      ),
    );
    touchDrag(viewport, viewport, 260, 100);
    await waitFor(() =>
      expect(screen.getByLabelText('Analytics, slide 1 of 3')).not.toHaveAttribute(
        'aria-hidden',
        'true',
      ),
    );
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

    await user.click(screen.getByRole('button', { name: 'Test quarter range' }));
    expect(analyticsViewCalls.at(-1)?.summary?.range).toBe('quarter');
    await user.click(screen.getByRole('button', { name: 'Test year range' }));
    expect(analyticsViewCalls.at(-1)?.summary?.range).toBe('year');
    await user.click(screen.getByRole('button', { name: 'Apply test custom range' }));
    expect(analyticsViewCalls.at(-1)?.summary?.range).toBe('custom');
  });

  it('passes one converted base-currency summary to Analytics and history to Transactions', () => {
    const date = new Date().toISOString();
    const day = date.slice(0, 10);
    historyData = [
      { ...historyRecords[0], id: 'thb', date, createdAt: date, updatedAt: date },
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
    expect(analyticsViewCalls.at(-1)?.summary?.expenseTotal).toBe(200);
    expect(transactionViewCalls.at(-1)?.history.records).toBe(historyData);
  });

  it('directs an unconfigured no-big-spending press to Settings', async () => {
    const onToast = vi.fn();
    renderCarousel({ onToast });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Toggle no big spending' }));
    expect(onToast).toHaveBeenCalledWith('Set a big spending cutoff in Settings.');
  });

  it('routes transaction selections from either review view to the shared editor', async () => {
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
    expect(settingsViewCalls.at(-1)?.analyticsSync.status).toBe('offline');
    expect(resync).not.toHaveBeenCalled();
  });
});
