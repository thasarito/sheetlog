import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';

describe('AnalyticsRangeToggle', () => {
  it('renders the compact W M Q Y C group and selects year and custom', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AnalyticsRangeToggle value="week" onChange={onChange} />);

    expect(screen.getByRole('group', { name: 'Analytics range' })).toHaveClass('grid-cols-5');
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quarter' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Year' }));
    expect(onChange).toHaveBeenCalledWith('year', expect.any(HTMLButtonElement));
    await user.click(screen.getByRole('button', { name: 'Custom date range' }));
    expect(onChange).toHaveBeenCalledWith('custom', expect.any(HTMLButtonElement));
  });
});
