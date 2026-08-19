import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionHistoryDock } from './TransactionHistoryDock';

const SearchOnlyDock = TransactionHistoryDock as unknown as ComponentType<
  Record<string, unknown>
>;

describe('TransactionHistoryDock search-only content', () => {
  it('keeps Search while removing transaction metadata and refresh controls', () => {
    render(
      <SearchOnlyDock
        search=""
        onSearchChange={vi.fn()}
        countLabel="327 transactions"
        statusLabel="Saved Aug 19, 13:42"
        canRefresh
        isRefreshing={false}
        onRefresh={vi.fn()}
      />,
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
