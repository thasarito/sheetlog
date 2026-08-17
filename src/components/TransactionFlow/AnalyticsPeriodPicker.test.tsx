import { act, fireEvent, render, screen } from '@testing-library/react';
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

function useMotionClock() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'],
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
    window.clearTimeout(handle);
  });
}

function advanceMotion(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function setPickerGeometry() {
  const picker = screen.getByTestId('analytics-period-picker');
  Object.defineProperty(picker, 'clientWidth', {
    configurable: true,
    value: 256,
  });
  screen.getAllByRole('option').forEach((option, index) => {
    Object.defineProperties(option, {
      offsetLeft: { configurable: true, value: index * 128 },
      offsetWidth: { configurable: true, value: 128 },
    });
  });
  fireEvent(window, new Event('resize'));
  return {
    picker,
    track: screen.getByTestId('analytics-period-track'),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AnalyticsPeriodPicker', () => {
  it('renders every local period as a transform track without scroll snapping', () => {
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
    expect(screen.getByTestId('analytics-period-picker')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('analytics-period-picker')).not.toHaveClass('snap-mandatory');
    expect(screen.getByTestId('analytics-period-track')).toHaveClass('will-change-transform');
    expect(screen.getByRole('option', { name: 'July 2026' })).toHaveClass('font-semibold');
    expect(screen.getByRole('option', { name: 'June 2026' })).toHaveClass('font-medium');
  });

  it('tracks a touch drag visually and commits only after the nearest period centers', () => {
    useMotionClock();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={0} onChange={onChange} />);
    const { picker, track } = setPickerGeometry();
    const initialTransform = track.style.transform;

    fireEvent.pointerDown(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 100,
      clientY: 20,
    });
    advanceMotion(100);
    fireEvent.pointerMove(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 140,
      clientY: 21,
    });
    advanceMotion(50);
    fireEvent.pointerMove(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 180,
      clientY: 21,
    });
    advanceMotion(400);
    fireEvent.pointerMove(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 180,
      clientY: 21,
    });
    advanceMotion(17);

    expect(track.style.transform).not.toBe(initialTransform);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(picker, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 180,
      clientY: 21,
    });
    advanceMotion(200);
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(900);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(-1);
  });

  it('leaves vertical gestures and mouse dragging inert', () => {
    useMotionClock();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
    const { picker, track } = setPickerGeometry();
    const initialTransform = track.style.transform;

    fireEvent.pointerDown(picker, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 100,
      clientY: 20,
    });
    fireEvent.pointerMove(picker, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 102,
      clientY: 100,
    });
    fireEvent.pointerUp(picker, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 102,
      clientY: 100,
    });

    fireEvent.pointerDown(picker, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 180,
      clientY: 20,
    });
    fireEvent.pointerMove(picker, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 40,
      clientY: 20,
    });
    fireEvent.pointerUp(picker, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 40,
      clientY: 20,
    });
    advanceMotion(600);

    expect(track.style.transform).toBe(initialTransform);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns to the controlled period without committing after pointer cancellation', () => {
    useMotionClock();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
    const { picker, track } = setPickerGeometry();
    const initialTransform = track.style.transform;

    fireEvent.pointerDown(picker, {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 100,
      clientY: 20,
    });
    fireEvent.pointerMove(picker, {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 190,
      clientY: 22,
    });
    advanceMotion(17);
    expect(track.style.transform).not.toBe(initialTransform);

    fireEvent.pointerCancel(picker, {
      pointerId: 5,
      pointerType: 'touch',
    });
    advanceMotion(400);

    expect(track.style.transform).toBe(initialTransform);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('animates arrows before committing one period and disables both boundaries', () => {
    useMotionClock();
    const onChange = vi.fn();
    const { rerender } = render(
      <AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />,
    );
    const { track } = setPickerGeometry();
    const initialTransform = track.style.transform;

    fireEvent.click(screen.getByRole('button', { name: 'Previous period, June 2026' }));
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(80);
    expect(track.style.transform).not.toBe(initialTransform);
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(-2);

    rerender(<AnalyticsPeriodPicker options={options} value={-3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Previous period' })).toBeDisabled();

    rerender(<AnalyticsPeriodPicker options={options} value={0} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled();
  });

  it('retargets repeated navigation and commits only the final destination', () => {
    useMotionClock();
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
    setPickerGeometry();

    const previous = screen.getByRole('button', { name: 'Previous period, June 2026' });
    fireEvent.click(previous);
    fireEvent.click(previous);
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(500);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(-3);
  });

  it('uses settled motion for option, keyboard, and horizontal wheel navigation', () => {
    useMotionClock();
    const onChange = vi.fn();
    const { rerender } = render(
      <AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />,
    );
    let geometry = setPickerGeometry();

    fireEvent.click(screen.getByRole('option', { name: 'May 2026' }));
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(400);
    expect(onChange).toHaveBeenLastCalledWith(-3);

    onChange.mockClear();
    rerender(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
    geometry = setPickerGeometry();
    fireEvent.keyDown(geometry.picker, { key: 'End' });
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(400);
    expect(onChange).toHaveBeenLastCalledWith(0);

    onChange.mockClear();
    rerender(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
    geometry = setPickerGeometry();
    fireEvent.wheel(geometry.picker, { deltaX: 96, deltaY: 2 });
    expect(onChange).not.toHaveBeenCalled();
    advanceMotion(700);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('centers and commits immediately when reduced motion is requested', () => {
    useMotionClock();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const onChange = vi.fn();
    render(<AnalyticsPeriodPicker options={options} value={-1} onChange={onChange} />);
    setPickerGeometry();

    fireEvent.click(screen.getByRole('button', { name: 'Previous period, June 2026' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(-2);
  });
});
