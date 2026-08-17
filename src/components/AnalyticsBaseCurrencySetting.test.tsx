import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsBaseCurrencySetting } from './AnalyticsBaseCurrencySetting';

describe('AnalyticsBaseCurrencySetting', () => {
  it('shows supported currencies and reports a selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AnalyticsBaseCurrencySetting value="THB" disabled={false} onChange={onChange} />);

    const picker = screen.getByRole('combobox', { name: 'Analytics base currency' });
    expect(picker).toHaveValue('THB');
    await user.selectOptions(picker, 'USD');
    expect(onChange).toHaveBeenCalledWith('USD');
  });

  it('disables selection while saving', () => {
    render(<AnalyticsBaseCurrencySetting value="THB" disabled onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Analytics base currency' })).toBeDisabled();
  });
});
