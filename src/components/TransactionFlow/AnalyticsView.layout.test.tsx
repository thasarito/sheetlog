import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildAnalyticsSummary, type AnalyticsPeriodOption, type DatePeriod } from './analytics';
import { AnalyticsView } from './AnalyticsView';

const now = new Date(2026, 7, 19, 12);
const customPeriod: DatePeriod = {
  start: new Date(2026, 7, 17),
  end: new Date(2026, 7, 19, 23, 59, 59, 999),
};
const periodOptions: AnalyticsPeriodOption[] = [
  {
    key: 'week-current',
    offset: 0,
    label: 'Aug 17–23',
    accessibleLabel: 'August 17, 2026 through August 23, 2026',
    period: customPeriod,
  },
];

function renderView() {
  const result = buildAnalyticsSummary({
    transactions: [],
    range: 'week',
    baseCurrency: 'THB',
    rates: [],
    now,
  });
  if (result.status !== 'ready') throw new Error('Expected ready analytics');

  return render(
    <AnalyticsView
      transactions={[]}
      summary={result.summary}
      baseCurrency="THB"
      bigSpendingThreshold={1000}
      noBigSpending={false}
      onNoBigSpendingToggle={vi.fn()}
      range="week"
      onRangeChange={vi.fn()}
      periodOptions={periodOptions}
      periodOffset={0}
      onPeriodChange={vi.fn()}
      customPeriod={customPeriod}
      onCustomPeriodChange={vi.fn()}
      isLoading={false}
      hasCompleteHistory
      isOffline={false}
      error={null}
      onRetry={vi.fn()}
      onSelectTransaction={vi.fn()}
      now={now}
    />,
  );
}

describe('AnalyticsView motion layout', () => {
  it('places left range controls before the chart and the period picker immediately after it', () => {
    renderView();

    const controls = screen.getByTestId('analytics-range-controls');
    const rangeToggle = within(controls).getByRole('group', { name: 'Analytics range' });
    const trendBlock = screen.getByTestId('analytics-trend-block');
    const chart = within(trendBlock).getByTestId('analytics-chart-plot');
    const picker = within(trendBlock).getByTestId('analytics-period-picker');

    expect(controls).toHaveClass('justify-between');
    expect(controls.firstElementChild).toBe(rangeToggle);
    expect(controls.compareDocumentPosition(trendBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chart.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trendBlock).toHaveClass('space-y-2');
  });
});
