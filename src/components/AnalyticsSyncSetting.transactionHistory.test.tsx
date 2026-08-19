import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';

const TransactionHistorySetting = AnalyticsSyncSetting as unknown as ComponentType<
  Record<string, unknown>
>;

function renderSetting(overrides: Record<string, unknown> = {}) {
  const onResync = vi.fn();
  render(
    <TransactionHistorySetting
      transactionCount={327}
      historyCapturedAt="2026-08-19T13:42:00.000Z"
      isHistoryLoading={false}
      isHistoryDownloading={false}
      isHistoryRefreshing={false}
      status="synced"
      lastSyncedAt="2026-08-19T13:42:00.000Z"
      isResyncing={false}
      onResync={onResync}
      {...overrides}
    />,
  );
  return { onResync };
}

describe('AnalyticsSyncSetting transaction history presentation', () => {
  it('shows the full transaction count and last saved timestamp', () => {
    renderSetting();

    expect(screen.getByText('Transaction history')).toBeInTheDocument();
    expect(
      screen.getByText('327 transactions · Last saved Aug 19, 13:42'),
    ).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText('Analytics sync')).not.toBeInTheDocument();
  });

  it('uses singular count and reports active history updates', () => {
    renderSetting({ transactionCount: 1, isHistoryRefreshing: true });

    expect(screen.getByText('1 transaction · Updating…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resync transaction history' }),
    ).toBeDisabled();
  });

  it('reports offline and not-downloaded states', () => {
    const { unmount } = renderSetting({
      status: 'offline',
      historyCapturedAt: undefined,
    });
    expect(screen.getByText('327 transactions · Offline')).toBeInTheDocument();
    unmount();

    renderSetting({
      transactionCount: 0,
      status: 'incomplete',
      historyCapturedAt: undefined,
    });
    expect(screen.getByText('0 transactions · Not downloaded')).toBeInTheDocument();
  });

  it('starts the existing manual resync action', async () => {
    const user = userEvent.setup();
    const { onResync } = renderSetting();

    await user.click(
      screen.getByRole('button', { name: 'Resync transaction history' }),
    );
    expect(onResync).toHaveBeenCalledTimes(1);
  });
});
