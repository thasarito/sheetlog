import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StepAmount } from './StepAmount';
import type { TransactionFormApi } from './useTransactionForm';

// Mock scrollIntoView for Picker which might use it
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

describe('StepAmount', () => {
  const mockForm = {
    useStore: (selector: any) =>
      selector({
        values: {
          type: 'expense',
          category: 'Food',
          amount: '100',
          currency: 'USD',
          account: 'Cash',
          forValue: 'Me',
          note: '',
          dateObject: new Date(),
        },
      }),
    setFieldValue: vi.fn(),
  } as unknown as TransactionFormApi;

  it('renders delete button with aria-label when onDelete is provided', () => {
    const html = renderToStaticMarkup(
      <StepAmount
        form={mockForm}
        accounts={['Cash', 'Bank']}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(html).toContain('aria-label="Delete transaction"');
  });

  it('does not render delete button when onDelete is missing', () => {
    const html = renderToStaticMarkup(
      <StepAmount
        form={mockForm}
        accounts={['Cash', 'Bank']}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).not.toContain('aria-label="Delete transaction"');
  });
});
