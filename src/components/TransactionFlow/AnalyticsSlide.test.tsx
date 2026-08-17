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
      start: new Date(2026, 7, 17),
      end: new Date(2026, 7, 23, 23, 59, 59, 999),
    },
    comparison: {
      start: new Date(2026, 7, 10),
      end: new Date(2026, 7, 16, 23, 59, 59, 999),
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
  axisGroups: [],
  categories: [{ category: 'Dining Out', amount: 920, share: 28 }],
  transactions: [],
  hasExpenseRows: true,
  convertedAmounts: {},
  excludedBigSpendingCount: 0,
};

const periodOptions: AnalyticsPeriodOption[] = [
  {
    key: 'week-previous',
    offset: -1,
    label: 'Aug 10–16',
    accessibleLabel: 'August 10, 2026 through August 16, 2026',
    period: {
      start: new Date(2026, 7, 10),
      end: new Date(2026, 7, 16, 23, 59, 59, 999),
    },
  },
  {
    key: 'week-current',
    offset: 0,
    label: 'Aug 17–23',
    accessibleLabel: 'August 17, 2026 through August 23, 2026',
    period: summary.periods.current,
  },
];

const periodProps = {
  periodOptions,
  periodOffset: 0,
  onPeriodChange: vi.fn(),
  onBucketSelect: vi.fn(),
};

function makeDailyBuckets(year: number, month: number, dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    return {
      key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      label: String(day),
      accessibleLabel: `Day ${day}`,
      amount: 0,
      segments: [{ seriesKey: 'category-0', amount: 0 }],
      transactionIds: [],
    };
  });
}

const juneBuckets = makeDailyBuckets(2026, 6, 30);
const julyBuckets = makeDailyBuckets(2026, 7, 31);

describe('AnalyticsSlide', () => {
  it('routes W M Q Y immediately and requests Custom without committing it', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onCustomRequest = vi.fn();
    const onBucketSelect = vi.fn();
    const onViewAll = vi.fn();
    render(
      <AnalyticsSlide
        {...periodProps}
        range="week"
        onRangeChange={onRangeChange}
        onCustomRequest={onCustomRequest}
        summary={summary}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onBucketSelect={onBucketSelect}
        onViewAll={onViewAll}
      />,
    );

    expect(screen.getByText('฿3,240')).toBeInTheDocument();
    expect(screen.getByText('spent · Aug 17–23')).toBeInTheDocument();
    expect(screen.getByText('12% below previous week')).toBeInTheDocument();
    expect(screen.queryByText(/last 7 days|to date|same elapsed days/)).not.toBeInTheDocument();
    expect(screen.getByTestId('segment-day-0-category-0')).toHaveAttribute(
      'data-tone',
      'emerald',
    );
    expect(screen.getAllByRole('option', { name: /August/ })).toHaveLength(2);
    const chart = screen.getByLabelText(/^Expense trend:/);
    expect(chart).toHaveClass('min-h-10', 'flex-1');
    expect(chart).not.toHaveClass('h-10');
    const firstBar = screen.getByRole('option', {
      name: 'Day 1, ฿100 · Dining Out ฿100',
    });
    await user.click(firstBar);
    expect(onBucketSelect).toHaveBeenCalledWith(
      'day-0',
      screen.getByRole('listbox', { name: 'Select analytics period' }),
    );
    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Year' }));
    expect(onRangeChange).toHaveBeenNthCalledWith(1, 'month');
    expect(onRangeChange).toHaveBeenNthCalledWith(2, 'year');

    await user.click(screen.getByRole('button', { name: 'Custom date range' }));
    expect(onRangeChange).not.toHaveBeenCalledWith('custom');
    expect(onCustomRequest).toHaveBeenCalledWith(expect.any(HTMLButtonElement));

    await user.click(screen.getByRole('button', { name: 'View all analytics' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('renders the shared grouped axis for a quarter summary', () => {
    render(
      <AnalyticsSlide
        {...periodProps}
        range="quarter"
        onRangeChange={vi.fn()}
        summary={{
          ...summary,
          range: 'quarter',
          axisGroups: [
            { key: '2026-04', label: 'Apr', bucketCount: 5 },
            { key: '2026-05', label: 'May', bucketCount: 4 },
            { key: '2026-06', label: 'Jun', bucketCount: 4 },
          ],
        }}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    const axis = screen.getByTestId('analytics-grouped-axis');
    expect(axis).toBeInTheDocument();
    expect(axis).toHaveTextContent('Apr');
  });

  it('renders the shared dense axis for a complete month', () => {
    render(
      <AnalyticsSlide
        {...periodProps}
        range="month"
        onRangeChange={vi.fn()}
        summary={{
          ...summary,
          range: 'month',
          buckets: juneBuckets,
          axisGroups: [],
        }}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    const labels = screen
      .getAllByTestId('analytics-month-axis-label')
      .map((label) => label.textContent);
    expect(labels.slice(0, 8)).toEqual(['1', 'T', 'W', 'T', 'F', 'S', 'S', '8']);
  });

  it('names the complete current year', () => {
    render(
      <AnalyticsSlide
        {...periodProps}
        periodOptions={[
          {
            key: 'year-current',
            offset: 0,
            label: '2026',
            accessibleLabel: 'January 1, 2026 through December 31, 2026',
            period: {
              start: new Date(2026, 0, 1),
              end: new Date(2026, 11, 31, 23, 59, 59, 999),
            },
          },
        ]}
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

    expect(screen.getByText('spent · 2026')).toBeInTheDocument();
    expect(screen.getByText('12% below previous year')).toBeInTheDocument();
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
        onBucketSelect={vi.fn()}
        range="month"
        onRangeChange={vi.fn()}
        summary={{
          ...summary,
          range: 'month',
          buckets: julyBuckets,
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
