import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsBucket, AnalyticsSeries } from './analytics';
import { AnalyticsBarChart, resolveAdjacentBucketKey } from './AnalyticsBarChart';

const series: AnalyticsSeries[] = [
  { key: 'food', label: 'Food', tone: 'emerald', categoryNames: ['Food'] },
];

const buckets: AnalyticsBucket[] = [
  {
    key: 'one',
    label: '1',
    accessibleLabel: 'Bucket one',
    amount: 10,
    segments: [{ seriesKey: 'food', amount: 10 }],
    transactionIds: ['one'],
  },
  {
    key: 'two',
    label: '2',
    accessibleLabel: 'Bucket two',
    amount: 20,
    segments: [{ seriesKey: 'food', amount: 20 }],
    transactionIds: ['two'],
  },
  {
    key: 'three',
    label: '3',
    accessibleLabel: 'Bucket three',
    amount: 30,
    segments: [{ seriesKey: 'food', amount: 30 }],
    transactionIds: ['three'],
  },
];

function touch(identifier: number, x: number, y: number) {
  return { identifier, pageX: x, pageY: y, clientX: x, clientY: y };
}

function dispatchTouch(
  target: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: ReturnType<typeof touch>[],
  changedTouches: ReturnType<typeof touch>[] = touches,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: touches },
    changedTouches: { value: changedTouches },
  });
  target.dispatchEvent(event);
  return event;
}

function renderInteractive(selectedKey?: string | null) {
  const onSelect = vi.fn();
  render(
    <AnalyticsBarChart
      range="week"
      buckets={buckets}
      series={series}
      currency="THB"
      selectedKey={selectedKey}
      onSelect={onSelect}
    />,
  );
  return { chart: screen.getByRole('listbox', { name: 'Select analytics period' }), onSelect };
}

describe('resolveAdjacentBucketKey', () => {
  it('moves exactly one adjacent bucket and respects both history bounds', () => {
    expect(resolveAdjacentBucketKey(buckets, 'two', 'later')).toBe('three');
    expect(resolveAdjacentBucketKey(buckets, 'two', 'earlier')).toBe('one');
    expect(resolveAdjacentBucketKey(buckets, 'three', 'later')).toBe('three');
    expect(resolveAdjacentBucketKey(buckets, 'one', 'earlier')).toBe('one');
  });

  it('enters an unselected chart from the matching keyboard edge', () => {
    expect(resolveAdjacentBucketKey(buckets, null, 'later')).toBe('one');
    expect(resolveAdjacentBucketKey(buckets, null, 'earlier')).toBe('three');
  });
});

describe('AnalyticsBarChart touch selection', () => {
  it('commits one later bucket on left release and suppresses the compatibility click', () => {
    const { chart, onSelect } = renderInteractive('one');

    dispatchTouch(chart, 'touchstart', [touch(1, 120, 40)]);
    const move = dispatchTouch(chart, 'touchmove', [touch(1, 70, 42)]);
    dispatchTouch(chart, 'touchend', [], [touch(1, 70, 42)]);

    expect(move.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('two');
    fireEvent.click(chart, { clientX: 180 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('commits one earlier bucket on right release', () => {
    const { chart, onSelect } = renderInteractive('three');

    dispatchTouch(chart, 'touchstart', [touch(2, 70, 40)]);
    dispatchTouch(chart, 'touchmove', [touch(2, 120, 42)]);
    dispatchTouch(chart, 'touchend', [], [touch(2, 120, 42)]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('two');
  });

  it('leaves a selected history boundary selected without emitting a toggle', () => {
    const { chart, onSelect } = renderInteractive('three');

    dispatchTouch(chart, 'touchstart', [touch(3, 120, 40)]);
    dispatchTouch(chart, 'touchmove', [touch(3, 70, 40)]);
    dispatchTouch(chart, 'touchend', [], [touch(3, 70, 40)]);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('treats a short horizontal movement as a tap candidate', () => {
    const { chart, onSelect } = renderInteractive(null);
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 300,
      top: 0,
      bottom: 100,
      width: 300,
      height: 100,
      toJSON: () => ({}),
    });

    dispatchTouch(chart, 'touchstart', [touch(4, 180, 40)]);
    dispatchTouch(chart, 'touchmove', [touch(4, 170, 41)]);
    dispatchTouch(chart, 'touchend', [], [touch(4, 170, 41)]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('two');
  });

  it('passes vertical gestures through without selecting or preventing scroll', () => {
    const { chart, onSelect } = renderInteractive('two');

    dispatchTouch(chart, 'touchstart', [touch(5, 120, 40)]);
    const move = dispatchTouch(chart, 'touchmove', [touch(5, 123, 100)]);
    dispatchTouch(chart, 'touchend', [], [touch(5, 123, 100)]);

    expect(move.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not select after cancellation or a multi-touch interaction', () => {
    const { chart, onSelect } = renderInteractive('two');

    dispatchTouch(chart, 'touchstart', [touch(6, 120, 40)]);
    dispatchTouch(chart, 'touchcancel', [], [touch(6, 70, 40)]);
    expect(onSelect).not.toHaveBeenCalled();

    dispatchTouch(chart, 'touchstart', [touch(7, 120, 40)]);
    dispatchTouch(chart, 'touchmove', [touch(7, 80, 40), touch(8, 90, 50)]);
    dispatchTouch(chart, 'touchend', [], [touch(7, 80, 40)]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('locks chart gestures away from the home carousel while keeping compact charts read-only', () => {
    const { chart } = renderInteractive(null);
    expect(chart).toHaveAttribute('data-home-carousel-swipe-lock', 'true');

    render(<AnalyticsBarChart range="week" buckets={buckets} series={series} currency="THB" />);
    expect(screen.getAllByTestId('analytics-chart-plot').at(-1)).not.toHaveAttribute('role');
  });
});
