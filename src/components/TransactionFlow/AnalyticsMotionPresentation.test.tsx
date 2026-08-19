import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsCategory, AnalyticsSeries } from './analytics';
import { AnalyticsCategories } from './AnalyticsCategories';
import { AnalyticsHalfDonut } from './AnalyticsHalfDonut';

const series: AnalyticsSeries[] = [
  { key: 'category-0', label: 'Food', tone: 'emerald', categoryNames: ['Food'] },
  { key: 'category-1', label: 'Travel', tone: 'cyan', categoryNames: ['Travel'] },
];
const categories: AnalyticsCategory[] = [
  { category: 'Food', amount: 75, share: 75 },
  { category: 'Travel', amount: 25, share: 25 },
];

describe('analytics motion presentation', () => {
  it('expands the donut viewport and keeps semantic arc identity with animated metrics', () => {
    const { container } = render(
      <AnalyticsHalfDonut
        series={series}
        categories={categories}
        expenseTotal={100}
        currency="THB"
      />,
    );

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 -3 200 112');
    expect(container.querySelector('svg')).toHaveClass('overflow-visible');
    expect(screen.getByTestId('donut-segment-category-0')).toHaveAttribute(
      'data-semantic-key',
      'Food',
    );
    expect(screen.getByLabelText(/Expenses ฿100/)).toBeInTheDocument();
    expect(screen.getByTestId('analytics-number')).toBeInTheDocument();
  });

  it('keeps semantic category rows while updating NumberFlow values and track endpoints', () => {
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
    expect(within(food).getAllByTestId('analytics-number')).toHaveLength(2);
    expect(
      within(screen.getByTestId('category-track-category-0'))
        .getAllByTestId('category-track-segment')
        .filter((segment) => segment.dataset.filled === 'true'),
    ).toHaveLength(12);

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
    expect(
      within(screen.getByTestId('category-track-category-0'))
        .getAllByTestId('category-track-segment')
        .filter((segment) => segment.dataset.filled === 'true'),
    ).toHaveLength(4);
  });
});
