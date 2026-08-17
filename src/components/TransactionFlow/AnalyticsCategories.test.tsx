import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsCategory, AnalyticsSeries } from './analytics';
import { AnalyticsCategories } from './AnalyticsCategories';

const series: AnalyticsSeries[] = [
  { key: 'food', label: 'Food', tone: 'emerald', categoryNames: ['Food'] },
  { key: 'travel', label: 'Travel', tone: 'cyan', categoryNames: ['Travel'] },
  { key: 'other', label: 'Other', tone: 'slate', categoryNames: ['Books', 'Gifts'] },
];

const categories: AnalyticsCategory[] = [
  { category: 'Food', amount: 60, share: 60 },
  { category: 'Books', amount: 40, share: 40 },
];

describe('AnalyticsCategories', () => {
  it('keeps stable series visible while recomputing amounts, shares, and segmented tracks', () => {
    render(
      <AnalyticsCategories
        series={series}
        categories={categories}
        currency="THB"
        onSelect={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('data-series-key'))).toEqual([
      'food',
      'travel',
      'other',
    ]);
    expect(rows[0]).toHaveAccessibleName('Food, ฿60, 60%');
    expect(rows[1]).toHaveAccessibleName('Travel, ฿0, 0%');
    expect(rows[1]).toHaveAttribute('data-zero', 'true');
    expect(rows[2]).toHaveAccessibleName('Other, ฿40, 40%');

    const foodTrack = screen.getByTestId('category-track-food');
    expect(within(foodTrack).getAllByTestId('category-track-segment')).toHaveLength(16);
    expect(
      within(foodTrack)
        .getAllByTestId('category-track-segment')
        .filter((segment) => segment.dataset.filled === 'true'),
    ).toHaveLength(10);
  });

  it('toggles the stable series key, including Other', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AnalyticsCategories
        series={series}
        categories={categories}
        currency="THB"
        selectedKey="other"
        onSelect={onSelect}
      />,
    );

    const other = screen.getByRole('button', { name: /Other/ });
    expect(other).toHaveAttribute('aria-pressed', 'true');
    await user.click(other);
    expect(onSelect).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole('button', { name: /Food/ }));
    expect(onSelect).toHaveBeenLastCalledWith('food');
  });
});
