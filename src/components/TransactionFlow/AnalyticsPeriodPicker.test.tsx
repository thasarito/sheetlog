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
    expect(screen.getByTestId('analytics-period-picker')).toHaveClass('[touch-action:pan-y]');
    expect(screen.getByTestId('analytics-period-picker')).not.toHaveClass('scroll-smooth');
    expect(screen.getByRole('option', { name: 'July 2026' })).toHaveClass('font-semibold');
    expect(screen.getByRole('option', { name: 'June 2026' })).toHaveClass('font-medium');
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

  it('does not select an intermediate option when controlled centering emits scroll later', () => {
    vi.useFakeTimers();
    const originalScrollTo = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollTo',
    );
    const scrollTo = vi.fn(function mockScrollTo(
      this: HTMLElement,
      options?: ScrollToOptions,
    ) {
      this.scrollLeft = Number(options?.left ?? 0);
      window.setTimeout(() => {
        this.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, 0);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    const onChange = vi.fn();

    try {
      render(<AnalyticsPeriodPicker options={options} value={0} onChange={onChange} />);
      vi.advanceTimersByTime(100);

      expect(scrollTo).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
      }
    }
  });

  it('accepts a user scroll when controlled centering required no movement', () => {
    vi.useFakeTimers();
    const originalScrollTo = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollTo',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    const onChange = vi.fn();

    try {
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
    } finally {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
      }
    }
  });

  it('lets touch drag the period strip while leaving mouse dragging inert', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={0} onChange={onChange} />);

    const picker = screen.getByTestId('analytics-period-picker');
    Object.defineProperties(picker, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 512 },
      scrollLeft: { configurable: true, writable: true, value: 256 },
    });
    screen.getAllByRole('option').forEach((option, index) => {
      Object.defineProperties(option, {
        offsetLeft: { configurable: true, value: index * 128 },
        offsetWidth: { configurable: true, value: 128 },
      });
    });

    fireEvent.pointerDown(picker, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 180,
      clientY: 20,
    });
    fireEvent.pointerMove(picker, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 20,
    });
    fireEvent.pointerUp(picker, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 20,
    });
    expect(picker.scrollLeft).toBe(256);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 100,
      clientY: 20,
    });
    fireEvent.pointerMove(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 240,
      clientY: 22,
    });
    fireEvent.pointerUp(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 240,
      clientY: 22,
    });
    vi.advanceTimersByTime(100);

    expect(picker.scrollLeft).toBe(116);
    expect(onChange).toHaveBeenCalledWith(-2);
  });
});
