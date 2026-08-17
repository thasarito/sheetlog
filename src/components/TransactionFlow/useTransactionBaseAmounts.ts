import { useMemo } from 'react';
import type { TransactionRecord } from '../../lib/types';
import { useHistoricalRatesQuery } from './exchangeRateQueries';
import {
  buildTransactionBaseAmountStates,
  buildTransactionBaseAmounts,
  getTransactionBaseAmountRateRequest,
} from './transactionBaseAmounts';

export function useTransactionBaseAmounts(
  transactions: readonly TransactionRecord[],
  baseCurrency: string,
  enabled: boolean,
) {
  const request = useMemo(
    () => getTransactionBaseAmountRateRequest(transactions, baseCurrency),
    [baseCurrency, transactions],
  );
  const query = useHistoricalRatesQuery(request, enabled && request !== null);
  const rates = query.data?.rates;
  const amounts = useMemo(
    () =>
      buildTransactionBaseAmounts(
        transactions,
        baseCurrency,
        rates ?? [],
      ),
    [baseCurrency, rates, transactions],
  );
  const isLoading =
    enabled && request !== null && query.data === undefined && !query.error;
  const states = useMemo(
    () =>
      buildTransactionBaseAmountStates(
        transactions,
        baseCurrency,
        amounts,
        isLoading,
      ),
    [amounts, baseCurrency, isLoading, transactions],
  );

  return {
    states,
    refetch: query.refetch,
    isRefreshing: query.isFetching,
  };
}
