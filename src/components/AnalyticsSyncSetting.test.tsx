import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';

type Props = ComponentProps<typeof AnalyticsSyncSetting>;

const defaultProps: Props = {
  transactionCount: 327,
  historyCapturedAt: '2026-08-19T13:42:00.000Z',
  isHistoryLoading: false,
  isHistoryDownloading: false,
  isHistoryRefreshing: false,
  status: 'synced',
  isResyncing: false,
  onResync: vi.fn(),
};

function renderSetting(overrides: Partial<Props> = {}) {
  return render(<AnalyticsSyncSetting {...defaultProps} {...overrides} />);
}

describe('AnalyticsSyncSetting', () => {
  it('shows transaction metadata and starts a manual resync', async () => {
    const user = userEvent.setup();
    const onResync = vi.fn();
    const rendered = renderSetting({ onResync });

    expect(screen.getByText('Transaction history')).toBeInTheDocument();
    expect(
      screen.getByText('327 transactions · Last saved Aug 19, 13:42'),
    ).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText('Analytics sync')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Resync transaction history' }),
    );
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(rendered.container.innerHTML).not.toContain('shadow');
  });

  it('shows a singular transaction count', () => {
    renderSetting({ transactionCount: 1 });

    expect(
      screen.getByText('1 transaction · Last saved Aug 19, 13:42'),
    ).toBeInTheDocument();
  });

  it.each([
    [{ isHistoryRefreshing: true }, '327 transactions · Updating…'],
    [
      {
        status: 'syncing',
        historyCapturedAt: undefined,
        isHistoryDownloading: true,
      },
      '327 transactions · Downloading…',
    ],
    [
      {
        status: 'offline',
        isHistoryLoading: true,
        isHistoryDownloading: true,
      },
      '327 transactions · Offline',
    ],
    [
      {
        transactionCount: 0,
        historyCapturedAt: undefined,
        status: 'incomplete',
      },
      '0 transactions · Not downloaded',
    ],
  ] as const)('renders transaction history state %#', (overrides, label) => {
    renderSetting(overrides);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('disables resync while automatic or manual work is active', () => {
    const rendered = renderSetting({ status: 'syncing' });
    const button = screen.getByRole('button', {
      name: 'Resync transaction history',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    rendered.rerender(
      <AnalyticsSyncSetting {...defaultProps} isResyncing />,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('disables resync while offline', () => {
    renderSetting({ status: 'offline' });

    const button = screen.getByRole('button', {
      name: 'Resync transaction history',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });
});
