import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';

const baseProps = {
  count: 3,
  capturedAt: '2026-08-19T13:42:00.000Z',
  status: 'synced' as const,
  isRefreshing: false,
  isDownloading: false,
  hasLocalHistory: true,
  isResyncing: false,
  onResync: vi.fn(),
};

describe('AnalyticsSyncSetting', () => {
  it('renders the unfiltered transaction count and last-saved timestamp', () => {
    render(<AnalyticsSyncSetting {...baseProps} />);

    expect(screen.getByText('Transaction history')).toBeInTheDocument();
    expect(screen.getByText('3 transactions')).toBeInTheDocument();
    expect(screen.getByText('Last saved Aug 19, 13:42')).toBeInTheDocument();
    expect(screen.queryByText('Analytics sync')).not.toBeInTheDocument();
  });

  it('uses the singular transaction label', () => {
    render(<AnalyticsSyncSetting {...baseProps} count={1} />);

    expect(screen.getByText('1 transaction')).toBeInTheDocument();
  });

  it('renders downloading, updating, offline, and not-downloaded states', () => {
    const rendered = render(
      <AnalyticsSyncSetting {...baseProps} isDownloading />,
    );
    expect(screen.getByText('Downloading…')).toBeInTheDocument();

    rendered.rerender(
      <AnalyticsSyncSetting {...baseProps} isResyncing />,
    );
    expect(screen.getByText('Updating…')).toBeInTheDocument();

    rendered.rerender(
      <AnalyticsSyncSetting {...baseProps} status="offline" />,
    );
    expect(
      screen.getByText('Offline · Last saved Aug 19, 13:42'),
    ).toBeInTheDocument();

    rendered.rerender(
      <AnalyticsSyncSetting
        {...baseProps}
        capturedAt={undefined}
        hasLocalHistory={false}
      />,
    );
    expect(screen.getByText('Not downloaded')).toBeInTheDocument();
  });

  it('starts one resync and disables the action while sync work is active', async () => {
    const user = userEvent.setup();
    const onResync = vi.fn();
    const rendered = render(
      <AnalyticsSyncSetting {...baseProps} onResync={onResync} />,
    );

    const button = screen.getByRole('button', {
      name: 'Resync transaction history',
    });
    await user.click(button);
    expect(onResync).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <AnalyticsSyncSetting
        {...baseProps}
        status="syncing"
        isResyncing
        onResync={onResync}
      />,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(rendered.container.innerHTML).not.toContain('shadow');
  });

  it('disables resync while offline or history is refreshing', () => {
    const rendered = render(
      <AnalyticsSyncSetting {...baseProps} status="offline" />,
    );
    expect(
      screen.getByRole('button', { name: 'Resync transaction history' }),
    ).toBeDisabled();

    rendered.rerender(
      <AnalyticsSyncSetting {...baseProps} isRefreshing />,
    );
    expect(
      screen.getByRole('button', { name: 'Resync transaction history' }),
    ).toBeDisabled();
  });
});
