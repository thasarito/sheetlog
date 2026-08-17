import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsPeriodOption } from './analytics';
import { AnalyticsPeriodPicker } from './AnalyticsPeriodPicker';

const labels = ['May 2026', 'June 2026', 'July 2026', 'August 2026'];
const options: AnalyticsPeriodOption[] = [-3, -2, -1, 0].map((offset, index) => ({
  key: `month-${offset}`,
  offset,
  label: labels[index],
  accessibleLabel: labels[index],
  period: {
    start: new Date(2026, index + 4, 1),
    end: new Date(2026, index + 5, 0, 23, 59, 59, 999),
  },
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('AnalyticsPeriodPicker', () => {
  it('renders every local period and exposes the selected option', () => {
    render(<AnalyticsPeriodPicker options={options} value={-1} onChange={vi.fn()} />);

    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: 'July 2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('analytics-period-picker')).toHaveAttribute(
      'data-home-carousel-swipe-lock',
      'true',
    );
    expect(screen.getByTestId('analytics-period-picker')).toHaveClass('[touch-action:pan-x]');
  });

  it('moves exactly one period with arrows and disables both boundaries', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Previous period, June 2026' }));
    expect(onChange).toHaveBeenLastCalledWith(-2);
    await user.click(screen.getByRole('button', { name: 'Next period, August 2026' }));
    expect(onChange).toHaveBeenLastCalledWith(0);

    rerender(<AnalyticsPeriodPicker options={options} value={-3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Previous period' })).toBeDisabled();

    rerender(<AnalyticsPeriodPicker options={options} value={0} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled();
  });

  it('supports option taps and keyboard navigation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);

    await user.click(screen.getByRole('option', { name: 'May 2026' }));
    expect(onChange).toHaveBeenLastCalledWith(-3);

    const picker = screen.getByRole('listbox', { name: 'Analytics period' });
    fireEvent.keyDown(picker, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(-2);
    fireEvent.keyDown(picker, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(picker, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(-3);
    fireEvent.keyDown(picker, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('selects the option nearest the viewport center after scrolling settles', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={0} onChange={onChange} />);

    const picker = screen.getByTestId('analytics-period-picker');
    Object.defineProperties(picker, {
      clientWidth: { configurable: true, value: 200 },
      scrollLeft: { configurable: true, writable: true, value: 220 },
    });
    screen.getAllByRole('option').forEach((option, index) => {
      Object.defineProperties(option, {
        offsetLeft: { configurable: true, value: index * 128 },
        offsetWidth: { configurable: true, value: 128 },
      });
    });

    fireEvent.scroll(picker);
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledWith(-1);
  });
});
