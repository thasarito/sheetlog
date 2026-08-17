import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsBucket, AnalyticsSeries } from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';

const series: AnalyticsSeries[] = [
  {
    key: 'category-0',
    label: 'Food',
    tone: 'emerald',
    categoryNames: ['Food'],
  },
  {
    key: 'category-1',
    label: 'Travel',
    tone: 'cyan',
    categoryNames: ['Travel'],
  },
];

const buckets: AnalyticsBucket[] = [
  {
    key: 'aug-16',
    label: '16',
    accessibleLabel: 'Sunday, August 16',
    amount: 100,
    segments: [
      { seriesKey: 'category-0', amount: 60 },
      { seriesKey: 'category-1', amount: 40 },
    ],
    transactionIds: ['one'],
  },
  {
    key: 'aug-17',
    label: '17',
    accessibleLabel: 'Monday, August 17',
    amount: 50,
    segments: [
      { seriesKey: 'category-0', amount: 80 },
      { seriesKey: 'category-1', amount: -30 },
    ],
    transactionIds: ['two'],
  },
];

describe('AnalyticsBarChart', () => {
  it('renders signed category segments and an accessible bucket summary', () => {
    render(<AnalyticsBarChart buckets={buckets} series={series} currency="THB" />);

    expect(
      screen.getByLabelText(/Expense trend: Sunday, August 16 ฿100, Monday, August 17 ฿50/),
    ).toBeInTheDocument();
    const bar = screen.getByTestId('analytics-bar-aug-17');
    expect(within(bar).getByTestId('segment-aug-17-category-0')).toHaveAttribute(
      'data-tone',
      'emerald',
    );
    expect(within(bar).getByTestId('segment-aug-17-category-1')).toHaveAttribute(
      'data-direction',
      'negative',
    );
  });

  it('keeps the selected stack colored and de-emphasizes every other bar without a border', () => {
    render(
      <AnalyticsBarChart
        buckets={buckets}
        series={series}
        currency="THB"
        selectedKey="aug-17"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('analytics-bar-aug-16')).toHaveAttribute('data-muted', 'true');
    expect(screen.getByTestId('analytics-bar-aug-17')).toHaveAttribute('data-muted', 'false');
    expect(screen.getByRole('option', { name: /Monday, August 17/ }).className).not.toMatch(
      /ring|border|outline/,
    );
  });

  it('supports click, arrow, edge, and clear keyboard selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <AnalyticsBarChart
        buckets={buckets}
        series={series}
        currency="THB"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole('option', { name: /Monday, August 17/ }));
    expect(onSelect).toHaveBeenLastCalledWith('aug-17');

    rerender(
      <AnalyticsBarChart
        buckets={buckets}
        series={series}
        currency="THB"
        selectedKey="aug-16"
        onSelect={onSelect}
      />,
    );
    const chart = screen.getByRole('listbox', { name: 'Select analytics period' });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('aug-17');
    fireEvent.keyDown(chart, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('aug-17');
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('aug-16');
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('keeps the compact chart read-only', () => {
    render(<AnalyticsBarChart buckets={buckets} series={series} currency="THB" />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
