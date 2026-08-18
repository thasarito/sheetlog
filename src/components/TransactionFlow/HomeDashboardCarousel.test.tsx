import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import type { DashboardHeaderMotionHandle } from '../Header';
import type { AnalyticsViewProps } from './AnalyticsView';
import { HomeDashboardCarousel } from './HomeDashboardCarousel';
import type { TransactionHistoryViewProps } from './TransactionHistoryView';
import type { AnalyticsSyncController } from './useAnalyticsSync';

const dockMotion = vi.fn();
const record: TransactionRecord = {
  id: 'expense',
  type: 'expense',
  amount: 100,
  currency: 'THB',
  account: 'Cash',
  for: 'Me',
  category: 'Dining Out',
  date: '2026-08-18T12:00:00',
  status: 'synced',
  sheetRowValid: true,
  createdAt: '2026-08-18T12:00:00',
  updatedAt: '2026-08-18T12:00:00',
};

vi.mock('./AnalyticsView', () => ({
  AnalyticsView: (_props: AnalyticsViewProps) => (
    <button type="button" data-home-carousel-swipe-lock="true">
      Nested swipe target
    </button>
  ),
}));

vi.mock('./TransactionHistoryView', () => ({
  TransactionHistoryView: (props: TransactionHistoryViewProps) => {
    const motionRef = (
      props as TransactionHistoryViewProps & {
        dockMotionRef?: { current: { setMotion: typeof dockMotion } | null };
      }
    ).dockMotionRef;
    if (motionRef) motionRef.current = { setMotion: dockMotion };
    return (
      <section
        data-testid="transaction-history-scroll"
        data-dashboard-scroll="true"
      />
    );
  },
}));

function renderCarousel() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function mockRect(this: HTMLElement) {
      const width = this.dataset.testid === 'home-carousel-viewport' ? 300 : 0;
      return {
        bottom: 600,
        height: 600,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    },
  );
  const headerMotion: DashboardHeaderMotionHandle = {
    setHorizontalMotion: vi.fn(),
    setVerticalProgress: vi.fn(),
  };
  const history: AnalyticsSyncController['history'] = {
    records: [record],
    meta: null,
    error: null,
    hasCompleteCache: true,
    hasLocalSnapshot: true,
    isLoading: false,
    isRefreshing: false,
    isDownloading: false,
    isOnline: true,
    remoteStatus: 'success',
    remoteFetchedAt: undefined,
    remoteError: null,
    refresh: vi.fn(),
  };
  const analyticsSync: AnalyticsSyncController = {
    history,
    records: [record],
    rates: [],
    hasLocalHistory: true,
    status: 'synced',
    lastSyncedAt: '2026-08-18T12:00:00.000Z',
    isResyncing: false,
    resync: vi.fn(),
  };
  render(
    <HomeDashboardCarousel
      baseCurrency="THB"
      bigSpendingThreshold={null}
      analyticsSync={analyticsSync}
      headerMotionRef={{ current: headerMotion }}
      onToast={vi.fn()}
      onEditTransaction={vi.fn()}
    />,
  );
  const viewport = screen.getByTestId('home-carousel-viewport');
  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    value: 300,
  });
  return { headerMotion, viewport };
}

function pointer(
  target: HTMLElement,
  type: 'pointerDown' | 'pointerMove' | 'pointerUp',
  x: number,
  pointerType: 'touch' | 'mouse' = 'touch',
) {
  fireEvent[type](target, {
    pointerId: 1,
    pointerType,
    clientX: x,
    clientY: 90,
  });
}

describe('HomeDashboardCarousel', () => {
  beforeEach(() => dockMotion.mockReset());

  it('loops from explicit keyboard direction without a carousel library', async () => {
    const { headerMotion, viewport } = renderCarousel();
    viewport.focus();

    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(viewport).toHaveAttribute('data-last-settled-direction', 'backward'),
    );
    expect(screen.getByLabelText('Transactions, slide 2 of 2')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(
      vi
        .mocked(headerMotion.setHorizontalMotion)
        .mock.calls.some(([index, progress]) => index === 0 && progress < 0),
    ).toBe(true);
    expect(viewport).toHaveFocus();
  });

  it('drives the title reel and dock from signed touch displacement', async () => {
    const { headerMotion, viewport } = renderCarousel();
    await waitFor(() => expect(dockMotion).toHaveBeenCalled());
    vi.mocked(headerMotion.setHorizontalMotion).mockClear();

    pointer(viewport, 'pointerDown', 260);
    pointer(viewport, 'pointerMove', 140);
    expect(headerMotion.setHorizontalMotion).toHaveBeenLastCalledWith(0, 0.4);
    expect(dockMotion.mock.calls.at(-1)?.[0].x).toBeCloseTo(180, 5);

    pointer(viewport, 'pointerMove', 380);
    expect(headerMotion.setHorizontalMotion).toHaveBeenLastCalledWith(0, -0.4);
    expect(dockMotion.mock.calls.at(-1)?.[0].x).toBeCloseTo(-180, 5);
    pointer(viewport, 'pointerUp', 380);

    await waitFor(() =>
      expect(viewport).toHaveAttribute('data-selected-snap', '1'),
    );
  });

  it('leaves nested gestures, mouse drags, and vertical scroll to their owners', async () => {
    const { headerMotion, viewport } = renderCarousel();
    const nested = screen.getByRole('button', { name: 'Nested swipe target' });

    pointer(nested, 'pointerDown', 260);
    pointer(viewport, 'pointerMove', 100);
    pointer(viewport, 'pointerUp', 100);
    pointer(viewport, 'pointerDown', 260, 'mouse');
    pointer(viewport, 'pointerMove', 100, 'mouse');
    pointer(viewport, 'pointerUp', 100, 'mouse');
    expect(viewport).toHaveAttribute('data-selected-snap', '0');

    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() => expect(viewport).toHaveAttribute('data-selected-snap', '1'));
    const scroll = screen.getByTestId('transaction-history-scroll');
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      value: 34,
    });
    vi.mocked(headerMotion.setVerticalProgress).mockClear();
    fireEvent.scroll(scroll);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
  });
});
