import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsSummary } from './analytics';
import { AnalyticsSlide } from './AnalyticsSlide';

const summary: AnalyticsSummary = {
  range: 'week',
  currency: 'THB',
  periods: {
    current: {
      start: new Date(2026, 7, 11),
      end: new Date(2026, 7, 17, 23, 59, 59, 999),
    },
    comparison: {
      start: new Date(2026, 7, 4),
      end: new Date(2026, 7, 10, 23, 59, 59, 999),
    },
  },
  expenseTotal: 3240,
  previousExpenseTotal: 3682,
  incomeTotal: 0,
  netTotal: -3240,
  comparison: { direction: 'below', percentage: 12 },
  buckets: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => ({
    key: `day-${index}`,
    label,
    accessibleLabel: `Day ${index + 1}`,
    amount: 100 + index * 25,
    transactionIds: [],
  })),
  categories: [{ category: 'Dining Out', amount: 920, share: 28 }],
  transactions: [],
  hasExpenseRows: true,
};

describe('AnalyticsSlide', () => {
  it('renders the approved W/M/Q summary and actions', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onViewAll = vi.fn();
    render(
      <AnalyticsSlide
        range="week"
        onRangeChange={onRangeChange}
        summary={summary}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={onViewAll}
      />,
    );

    expect(screen.getByText('฿3,240')).toBeInTheDocument();
    expect(screen.getByText('12% below previous 7 days')).toBeInTheDocument();
    expect(screen.getByText(/Dining Out/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('month');
    await user.click(screen.getByRole('button', { name: 'View all analytics' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('renders fixed in-slide loading, empty, and uncached-error states', () => {
    const { rerender } = render(
      <AnalyticsSlide
        range="week"
        onRangeChange={vi.fn()}
        isLoading
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Loading analytics')).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        range="week"
        onRangeChange={vi.fn()}
        summary={{ ...summary, hasExpenseRows: false }}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );
    expect(screen.getByText('No expenses in this period')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all analytics' })).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        range="week"
        onRangeChange={vi.fn()}
        isLoading={false}
        isOffline
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Full range unavailable offline')).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        range="week"
        onRangeChange={vi.fn()}
        isLoading={false}
        isOffline={false}
        error={new Error('network')}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        range="week"
        onRangeChange={vi.fn()}
        summary={summary}
        isLoading={false}
        isOffline
        updatedAt={new Date(2026, 7, 17, 9, 30).getTime()}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Offline · saved 09:30')).toBeInTheDocument();
  });
});
