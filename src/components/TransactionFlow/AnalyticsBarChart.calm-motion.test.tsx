import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsBucket, AnalyticsSeries } from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';

const series: AnalyticsSeries[] = [
  { key: 'food', label: 'Food', tone: 'emerald', categoryNames: ['Food'] },
];
const buckets: AnalyticsBucket[] = [
  {
    key: '2026-08-17',
    label: 'M',
    accessibleLabel: 'Monday, August 17',
    amount: 100,
    segments: [{ seriesKey: 'food', amount: 100 }],
    transactionIds: ['one'],
  },
  {
    key: '2026-08-18',
    label: 'T',
    accessibleLabel: 'Tuesday, August 18',
    amount: 50,
    segments: [{ seriesKey: 'food', amount: 50 }],
    transactionIds: ['two'],
  },
];

describe('AnalyticsBarChart calm motion', () => {
  it('keeps incoming geometry final and uses opacity plus a shared selection marker', () => {
    render(
      <AnalyticsBarChart
        range="week"
        buckets={buckets}
        series={series}
        currency="THB"
        selectedKey="2026-08-18"
        onSelect={vi.fn()}
        motionIntent={{ reason: 'bucket', direction: 0, transitionKey: 'week:0' }}
      />,
    );

    const figure = screen.getByLabelText(/Expense trend/);
    expect(figure).toHaveAttribute('data-motion-reason', 'bucket');
    expect(figure).toHaveAttribute('data-motion-direction', '0');
    expect(screen.getByTestId('analytics-selected-bucket-marker')).toBeInTheDocument();
    expect(screen.getByTestId('positive-stack-2026-08-17')).toHaveStyle({
      height: '100%',
      opacity: '0.45',
    });
    expect(screen.getByTestId('positive-stack-2026-08-17')).not.toHaveStyle({
      filter: 'grayscale(1)',
    });
  });

  it('exposes directional period replacement at the chart-scene boundary', () => {
    const { rerender } = render(
      <AnalyticsBarChart
        range="week"
        buckets={buckets}
        series={series}
        currency="THB"
        onSelect={vi.fn()}
      />,
    );
    const firstSceneKey = screen.getByLabelText(/Expense trend/).getAttribute(
      'data-chart-scene-key',
    );

    const nextBuckets = buckets.map((bucket, index) => ({
      ...bucket,
      key: `2026-08-${24 + index}`,
      accessibleLabel: `${index === 0 ? 'Monday' : 'Tuesday'}, August ${24 + index}`,
    }));
    rerender(
      <AnalyticsBarChart
        range="week"
        buckets={nextBuckets}
        series={series}
        currency="THB"
        onSelect={vi.fn()}
        motionIntent={{ reason: 'period', direction: 1, transitionKey: 'week:1' }}
      />,
    );

    const figure = screen.getByLabelText(/Expense trend/);
    expect(figure).toHaveAttribute('data-motion-reason', 'period');
    expect(figure).toHaveAttribute('data-motion-direction', '1');
    expect(figure.getAttribute('data-chart-scene-key')).not.toBe(firstSceneKey);
  });
});
