import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DatePeriod } from './analytics';
import { AnalyticsRangeDrawer } from './AnalyticsRangeDrawer';

const committedPeriod: DatePeriod = {
  start: new Date(2026, 7, 1),
  end: new Date(2026, 7, 17),
};

function RangeDrawerHarness({
  onApply,
}: {
  onApply: (period: DatePeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Open custom range
      </button>
      <AnalyticsRangeDrawer
        open={open}
        onOpenChange={setOpen}
        value={committedPeriod}
        minDate={new Date(2026, 6, 1)}
        maxDate={new Date(2026, 7, 17)}
        onApply={onApply}
        returnFocusTo={triggerRef.current}
      />
    </>
  );
}

describe('AnalyticsRangeDrawer', () => {
  it('keeps an incomplete draft local and applies a bounded same-day range', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RangeDrawerHarness onApply={onApply} />);

    const trigger = screen.getByRole('button', { name: 'Open custom range' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Custom date range' });
    expect(dialog.querySelectorAll('[role="grid"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /August 18/ })).toBeDisabled();

    const augustFifth = screen.getByRole('button', { name: /August 5th, 2026/ });
    act(() => augustFifth.focus());
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /August 6th, 2026/ })).toHaveFocus();

    await user.click(augustFifth);
    expect(screen.getByRole('button', { name: 'Apply custom range' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();

    await user.click(augustFifth);
    const apply = screen.getByRole('button', { name: 'Apply custom range' });
    expect(apply).toBeEnabled();
    await user.click(apply);

    expect(onApply).toHaveBeenCalledWith({
      start: new Date(2026, 7, 5),
      end: new Date(2026, 7, 5),
    });
    expect(dialog).toHaveAttribute('data-state', 'closed');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('discards a cancelled draft and resets from the committed value', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RangeDrawerHarness onApply={onApply} />);

    const trigger = screen.getByRole('button', { name: 'Open custom range' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /August 6th, 2026/ }));
    await user.click(screen.getByRole('button', { name: /August 12th, 2026/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel custom range' }));

    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));
    expect(onApply).toHaveBeenCalledWith(committedPeriod);
  });

  it('closes on Escape without applying and restores trigger focus', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<RangeDrawerHarness onApply={onApply} />);

    const trigger = screen.getByRole('button', { name: 'Open custom range' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Custom date range' });
    await user.keyboard('{Escape}');

    expect(dialog).toHaveAttribute('data-state', 'closed');
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
