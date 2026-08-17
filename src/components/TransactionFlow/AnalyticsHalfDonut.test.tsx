import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnalyticsCategory, AnalyticsSeries } from './analytics';
import { AnalyticsHalfDonut } from './AnalyticsHalfDonut';

const series: AnalyticsSeries[] = [
  { key: 'food', label: 'Food', tone: 'emerald', categoryNames: ['Food'] },
  { key: 'travel', label: 'Travel', tone: 'cyan', categoryNames: ['Travel'] },
  { key: 'other', label: 'Other', tone: 'slate', categoryNames: ['Books', 'Gifts'] },
];

const categories: AnalyticsCategory[] = [
  { category: 'Food', amount: 60, share: 60 },
  { category: 'Books', amount: 40, share: 40 },
];

describe('AnalyticsHalfDonut', () => {
  it('renders the scoped total and grouped category arcs accessibly', () => {
    render(
      <AnalyticsHalfDonut
        series={series}
        categories={categories}
        expenseTotal={100}
        currency="THB"
      />,
    );

    expect(
      screen.getByLabelText('Spending by category: Food 60%, Travel 0%, Other 40%. Expenses ฿100'),
    ).toBeInTheDocument();
    expect(screen.getByText('฿100')).toBeInTheDocument();
    expect(screen.getByTestId('donut-segment-food')).toHaveAttribute('data-tone', 'emerald');
    expect(screen.getByTestId('donut-segment-other')).toHaveAttribute('data-tone', 'slate');
    expect(screen.queryByTestId('donut-segment-travel')).not.toBeInTheDocument();
  });
});
