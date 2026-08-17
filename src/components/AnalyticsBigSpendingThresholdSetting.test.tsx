import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsBigSpendingThresholdSetting } from './AnalyticsBigSpendingThresholdSetting';

describe('AnalyticsBigSpendingThresholdSetting', () => {
  it('commits a positive amount on blur and clears a blank value', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={null}
        disabled={false}
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Big spending cutoff in THB' });

    await user.type(input, '10000');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(10_000);

    rerender(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={10_000}
        disabled={false}
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    await user.click(input);
    await user.clear(input);
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it('rejects non-positive input and restores the durable value', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onInvalid = vi.fn();
    render(
      <AnalyticsBigSpendingThresholdSetting
        currency="USD"
        value={500}
        disabled={false}
        onCommit={onCommit}
        onInvalid={onInvalid}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Big spending cutoff in USD' });

    await user.clear(input);
    await user.type(input, '-1');
    await user.tab();
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('500');
  });

  it('cancels an edit with Escape and disables input while saving', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={10_000}
        disabled={false}
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Big spending cutoff in THB' });

    await user.clear(input);
    await user.type(input, '20000');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('10000');
    expect(onCommit).not.toHaveBeenCalled();

    rerender(
      <AnalyticsBigSpendingThresholdSetting
        currency="THB"
        value={10_000}
        disabled
        onCommit={onCommit}
        onInvalid={vi.fn()}
      />,
    );
    expect(input).toBeDisabled();
  });
});
