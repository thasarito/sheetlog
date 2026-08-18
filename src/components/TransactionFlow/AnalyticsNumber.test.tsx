import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsNumber } from './AnalyticsNumber';

describe('AnalyticsNumber', () => {
  it.each([
    ['THB', 1234.5, '฿1,234.5'],
    ['USD', 1234.5, '$1,234.5'],
    ['EUR', 1234.5, 'EUR1,234.5'],
    ['THB', -300, '-฿300'],
    ['USD', 12.345, '$12.35'],
  ])('keeps the settled %s currency contract for %s', (currency, value, expected) => {
    render(
      <AnalyticsNumber value={value} presentation="currency" currency={currency} />,
    );

    const number = screen.getByTestId('analytics-number');
    expect(within(number).getByText(expected)).toHaveClass('sr-only');
    expect(number.querySelector('number-flow-react')).toHaveAttribute('aria-hidden', 'true');
  });

  it('formats percentage values as settled integers', () => {
    render(<AnalyticsNumber value={61.7} presentation="percentage" />);

    expect(within(screen.getByTestId('analytics-number')).getByText('62%')).toHaveClass('sr-only');
  });

  it('updates accessible text immediately to the settled value', () => {
    const { rerender } = render(
      <AnalyticsNumber value={100} presentation="currency" currency="THB" />,
    );

    rerender(<AnalyticsNumber value={250} presentation="currency" currency="THB" />);

    const number = screen.getByTestId('analytics-number');
    expect(within(number).getByText('฿250')).toBeInTheDocument();
    expect(within(number).queryByText('฿100')).not.toBeInTheDocument();
  });
});
