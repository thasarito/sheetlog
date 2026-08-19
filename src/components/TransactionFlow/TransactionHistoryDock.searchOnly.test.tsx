import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionHistoryDock } from './TransactionHistoryDock';

describe('TransactionHistoryDock search-only content', () => {
  it('keeps Search while removing transaction metadata and refresh controls', () => {
    render(
      <TransactionHistoryDock search="" onSearchChange={vi.fn()} />,
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search transaction history' }),
    ).toBeVisible();
    expect(
      screen.queryByTestId('transaction-history-metadata'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Refresh transaction history' }),
    ).not.toBeInTheDocument();
  });
});
