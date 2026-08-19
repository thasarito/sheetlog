import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsCategory, AnalyticsSeries } from './analytics';
import { AnalyticsCategories } from './AnalyticsCategories';
import { AnalyticsHalfDonut } from './AnalyticsHalfDonut';
import type { AnalyticsMotionIntent } from './analyticsMotion';

const series: AnalyticsSeries[] = [
  { key: 'category-0', label: 'Food', tone: 'emerald', categoryNames: ['Food'] },
  { key: 'category-1', label: 'Travel', tone: 'cyan', categoryNames: ['Travel'] },
];
const categories: AnalyticsCategory[] = [
  { category: 'Food', amount: 75, share: 75 },
  { category: 'Travel', amount: 25, share: 25 },
];
const periodIntent: AnalyticsMotionIntent = {
  reason: 'period',
  direction: 1,
  transitionKey: 'week:0',
};

describe('analytics motion presentation', () => {
  it('crossfades donut scenes while keeping semantic arc identity and animated totals', () => {
    const { container } = render(
      <AnalyticsHalfDonut
        series={series}
        categories={categories}
        expenseTotal={100}
        currency="THB"
        motionIntent={periodIntent}
      />,
    );

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 -3 200 112');
    expect(container.querySelector('svg')).toHaveClass('overflow-visible');
    expect(screen.getByTestId('donut-segment-category-0')).toHaveAttribute(
      'data-semantic-key',
      'Food',
    );
    expect(
      screen.getByTestId('analytics-donut-scene').getAttribute('data-donut-scene-key'),
    ).toContain('week:0');
    expect(screen.getByLabelText(/Expenses ฿100/)).toBeInTheDocument();
    expect(screen.getByTestId('analytics-number')).toBeInTheDocument();
  });

  it('keeps category values quiet and animates one clipped track layer per row', () => {
    const { rerender } = render(
      <AnalyticsCategories
        series={series}
        categories={categories}
        currency="THB"
        onSelect={vi.fn()}
      />,
    );

    const food = screen.getByRole('button', { name: 'Food, ฿75, 75%' });
    expect(food).toHaveAttribute('data-semantic-key', 'Food');
    expect(within(food).queryByTestId('analytics-number')).not.toBeInTheDocument();
    expect(within(food).getByText('฿75')).toBeInTheDocument();
    expect(within(food).getByText('75%')).toBeInTheDocument();
    expect(within(food).getAllByTestId('category-track-fill')).toHaveLength(1);
    expect(screen.getByTestId('category-track-category-0')).toHaveAttribute(
      'data-filled-segments',
      '12',
    );

    rerender(
      <AnalyticsCategories
        series={series}
        categories={[
          { category: 'Food', amount: 25, share: 25 },
          { category: 'Travel', amount: 75, share: 75 },
        ]}
        currency="THB"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Food, ฿25, 25%' })).toHaveAttribute(
      'data-semantic-key',
      'Food',
    );
    expect(screen.getByTestId('category-track-category-0')).toHaveAttribute(
      'data-filled-segments',
      '4',
    );
  });
});
