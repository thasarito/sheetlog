import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsPeriodOption, AnalyticsSummary } from './analytics';
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
  series: [
    {
      key: 'category-0',
      label: 'Dining Out',
      tone: 'emerald',
      categoryNames: ['Dining Out'],
    },
  ],
  buckets: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => ({
    key: `day-${index}`,
    label,
    accessibleLabel: `Day ${index + 1}`,
    amount: 100 + index * 25,
    segments: [{ seriesKey: 'category-0', amount: 100 + index * 25 }],
    transactionIds: [],
  })),
  categories: [{ category: 'Dining Out', amount: 920, share: 28 }],
  transactions: [],
  hasExpenseRows: true,
};

const periodOptions: AnalyticsPeriodOption[] = [
  {
    key: 'week-previous',
    offset: -1,
    label: 'Aug 4–10',
    accessibleLabel: 'August 4, 2026 through August 10, 2026',
    period: {
      start: new Date(2026, 7, 4),
      end: new Date(2026, 7, 10, 23, 59, 59, 999),
    },
  },
  {
    key: 'week-current',
    offset: 0,
    label: 'Aug 11–17',
    accessibleLabel: 'August 11, 2026 through August 17, 2026',
    period: summary.periods.current,
  },
];

const periodProps = {
  periodOptions,
  periodOffset: 0,
  onPeriodChange: vi.fn(),
};

describe('AnalyticsSlide', () => {
  it('renders the approved W/M/Q/Y/C stacked summary and actions', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onViewAll = vi.fn();
    render(
      <AnalyticsSlide
        {...periodProps}
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
    expect(screen.getByTestId('segment-day-0-category-0')).toHaveAttribute(
      'data-tone',
      'emerald',
    );
    expect(screen.getAllByRole('option', { name: /August/ })).toHaveLength(2);
    const chart = screen.getByLabelText(/^Expense trend:/);
    expect(chart).toHaveClass('min-h-10', 'flex-1');
    expect(chart).not.toHaveClass('h-10');
    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('month');
    await user.click(screen.getByRole('button', { name: 'Year, year to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('year');
    await user.click(screen.getByRole('button', { name: 'Custom date range' }));
    expect(onRangeChange).toHaveBeenCalledWith('custom');
    await user.click(screen.getByRole('button', { name: 'View all analytics' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('uses year-to-date copy for a year summary', () => {
    render(
      <AnalyticsSlide
        {...periodProps}
        range="year"
        onRangeChange={vi.fn()}
        summary={{ ...summary, range: 'year' }}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    expect(screen.getByText('spent · year to date')).toBeInTheDocument();
    expect(screen.getByText('12% below the same elapsed days last year')).toBeInTheDocument();
  });

  it('uses custom range copy for a custom summary', () => {
    render(
      <AnalyticsSlide
        {...periodProps}
        range="custom"
        onRangeChange={vi.fn()}
        summary={{
          ...summary,
          range: 'custom',
          comparison: { direction: 'above', percentage: 10 },
        }}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    expect(screen.getByText('spent · custom range')).toBeInTheDocument();
    expect(screen.getByText('10% above the previous period')).toBeInTheDocument();
  });

  it('renders fixed in-slide loading, empty, and uncached-error states', () => {
    const { rerender } = render(
      <AnalyticsSlide
        {...periodProps}
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
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        {...periodProps}
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
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all analytics' })).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        {...periodProps}
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
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        {...periodProps}
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
    expect(screen.getByRole('listbox', { name: 'Analytics period' })).toBeInTheDocument();

    rerender(
      <AnalyticsSlide
        {...periodProps}
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

  it('names a complete historical month instead of calling it month to date', () => {
    render(
      <AnalyticsSlide
        periodOptions={[
          {
            key: 'month-july',
            offset: -1,
            label: 'July 2026',
            accessibleLabel: 'July 2026',
            period: {
              start: new Date(2026, 6, 1),
              end: new Date(2026, 6, 31, 23, 59, 59, 999),
            },
          },
          {
            key: 'month-august',
            offset: 0,
            label: 'August 2026',
            accessibleLabel: 'August 2026',
            period: summary.periods.current,
          },
        ]}
        periodOffset={-1}
        onPeriodChange={vi.fn()}
        range="month"
        onRangeChange={vi.fn()}
        summary={{
          ...summary,
          range: 'month',
          periods: {
            ...summary.periods,
            current: {
              start: new Date(2026, 6, 1),
              end: new Date(2026, 6, 31, 23, 59, 59, 999),
            },
          },
        }}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    expect(screen.getByText('spent · July 2026')).toBeInTheDocument();
    expect(screen.queryByText(/month to date/)).not.toBeInTheDocument();
    expect(screen.getByText('12% below previous month')).toBeInTheDocument();
  });
});
