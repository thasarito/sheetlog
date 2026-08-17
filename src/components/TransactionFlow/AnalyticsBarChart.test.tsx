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
      screen.getByLabelText(
        /Expense trend: Sunday, August 16, ฿100 .*Monday, August 17, ฿50/,
      ),
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

  it('selects the nearest bucket from the full plot and exposes the active option breakdown', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <AnalyticsBarChart
        buckets={buckets}
        series={series}
        currency="THB"
        onSelect={onSelect}
      />,
    );
    const chart = screen.getByRole('listbox', { name: 'Select analytics period' });
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 0,
      left: 10,
      right: 210,
      top: 0,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(chart, { clientX: 165 });
    expect(onSelect).toHaveBeenLastCalledWith('aug-17');

    rerender(
      <AnalyticsBarChart
        buckets={buckets}
        series={series}
        currency="THB"
        selectedKey="aug-17"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('listbox', { name: 'Select analytics period' })).toHaveAttribute(
      'aria-activedescendant',
      'analytics-option-aug-17',
    );
    expect(screen.getByRole('option', { name: /Monday, August 17/ })).toHaveAccessibleName(
      'Monday, August 17, ฿50 · Food ฿80, Travel -฿30',
    );
  });

  it('uses truthful segment heights and weekly sparse labels for dense daily charts', () => {
    const denseBuckets: AnalyticsBucket[] = Array.from({ length: 17 }, (_, index) => ({
      key: `aug-${index + 1}`,
      label: String(index + 1),
      accessibleLabel: `August ${index + 1}`,
      amount: index === 0 ? 100 : 1,
      segments: [{ seriesKey: 'category-0', amount: index === 0 ? 100 : 1 }],
      transactionIds: [],
    }));
    render(
      <AnalyticsBarChart buckets={denseBuckets} series={series} currency="THB" />,
    );

    const tinySegment = screen.getByTestId('segment-aug-2-category-0').parentElement;
    expect(tinySegment).toHaveStyle({ height: '1%' });
    expect(
      screen
        .getAllByTestId(/^analytics-label-/)
        .map((label) => label.textContent)
        .filter(Boolean),
    ).toEqual(['1', '8', '15', '17']);
  });

  it('keeps every calendar-month label visible for year-to-date charts', () => {
    const monthLabels = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthlyBuckets: AnalyticsBucket[] = monthLabels.map((label, index) => ({
      key: `2026-${String(index + 1).padStart(2, '0')}-month`,
      label,
      accessibleLabel: `${label} 2026`,
      amount: index + 1,
      segments: [{ seriesKey: 'category-0', amount: index + 1 }],
      transactionIds: [],
    }));

    render(<AnalyticsBarChart buckets={monthlyBuckets} series={series} currency="THB" />);

    expect(
      screen
        .getAllByTestId(/^analytics-label-/)
        .map((label) => label.textContent)
        .filter(Boolean),
    ).toEqual(monthLabels);
  });

  it('keeps the compact chart read-only', () => {
    render(<AnalyticsBarChart buckets={buckets} series={series} currency="THB" />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
