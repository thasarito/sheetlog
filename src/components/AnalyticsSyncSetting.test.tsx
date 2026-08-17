import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';

describe('AnalyticsSyncSetting', () => {
  it.each([
    ['syncing', undefined, 'Syncing…'],
    ['synced', '2026-08-17T12:34:00.000Z', 'Synced · 12:34 PM'],
    ['incomplete', undefined, 'Incomplete'],
    ['offline', undefined, 'Offline · waiting'],
  ] as const)('renders %s status', (status, lastSyncedAt, label) => {
    render(
      <AnalyticsSyncSetting
        status={status}
        lastSyncedAt={lastSyncedAt}
        isResyncing={false}
        onResync={vi.fn()}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/rate unavailable|excluded/i)).not.toBeInTheDocument();
  });

  it('starts a non-blocking resync and disables only its own action while pending', async () => {
    const user = userEvent.setup();
    const onResync = vi.fn();
    const rendered = render(
      <AnalyticsSyncSetting
        status="incomplete"
        isResyncing={false}
        onResync={onResync}
      />,
    );

    const button = screen.getByRole('button', { name: 'Resync analytics' });
    await user.click(button);
    expect(onResync).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <AnalyticsSyncSetting
        status="syncing"
        isResyncing
        onResync={onResync}
      />,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(rendered.container.innerHTML).not.toContain('shadow');
  });
});
