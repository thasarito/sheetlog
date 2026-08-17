import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsRangePicker } from './AnalyticsRangePicker';

describe('AnalyticsRangePicker', () => {
  it('selects a bounded range in a one-month popover and restores trigger focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AnalyticsRangePicker
        value={{ start: new Date(2026, 7, 1), end: new Date(2026, 7, 17) }}
        minDate={new Date(2026, 6, 1)}
        maxDate={new Date(2026, 7, 17)}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Custom date range/ });
    expect(trigger).toHaveTextContent('Aug 1 – Aug 17');
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Choose custom date range' });
    expect(dialog.querySelectorAll('[role="grid"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /August 18/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /August 5/ }));
    await user.click(screen.getByRole('button', { name: /August 12/ }));

    expect(onChange).toHaveBeenLastCalledWith({
      start: new Date(2026, 7, 5),
      end: new Date(2026, 7, 12),
    });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Choose custom date range' })).not.toBeInTheDocument();
  });

  it('reports its open state when Escape closes the calendar', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AnalyticsRangePicker
        value={{ start: new Date(2026, 7, 1), end: new Date(2026, 7, 17) }}
        minDate={new Date(2026, 6, 1)}
        maxDate={new Date(2026, 7, 17)}
        onChange={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Custom date range/ }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('opens a requested calendar under Strict Mode', async () => {
    render(
      <StrictMode>
        <AnalyticsRangePicker
          value={{ start: new Date(2026, 7, 1), end: new Date(2026, 7, 17) }}
          minDate={new Date(2026, 6, 1)}
          maxDate={new Date(2026, 7, 17)}
          openRequest={1}
          onChange={vi.fn()}
        />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('dialog', { name: 'Choose custom date range' }),
    ).toBeVisible();
  });
});
