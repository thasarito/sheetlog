import { describe, expect, it } from 'vitest';
import type { ExchangeRateRecord, TransactionRecord, TransactionType } from '../../lib/types';
import {
  buildAnalyticsRateChunks,
  buildAnalyticsRateReadRequest,
  buildAnalyticsRateRequirements,
  buildAnalyticsRateRequirementsFingerprint,
  buildHistoricalRateResolver,
  unresolvedAnalyticsRateRequirements,
} from './analyticsSync';

function transaction({
  id,
  date,
  currency = 'THB',
  type = 'expense',
  amount = 1,
}: {
  id: string;
  date: string;
  currency?: string;
  type?: TransactionType;
  amount?: number;
}): TransactionRecord {
  return {
    id,
    date,
    currency,
    type,
    amount,
    account: 'Cash',
    for: 'Me',
    category: 'Dining',
    status: 'synced',
    createdAt: date,
    updatedAt: date,
  };
}

function rate(
  quote: string,
  date: string,
  value: number,
  base = 'THB',
): ExchangeRateRecord {
  return {
    id: `${base}:${quote}:${date}`,
    base,
    quote,
    date,
    rate: value,
    fetchedAt: '2026-08-17T00:00:00.000Z',
  };
}

describe('buildAnalyticsRateRequirements', () => {
  it('discovers unique foreign transaction dates, including transfers, but ignores base rows', () => {
    const records = [
      transaction({ id: 'base', date: '2026-08-17T10:00:00', currency: 'THB' }),
      transaction({ id: 'usd', date: '2026-08-17T11:00:00', currency: 'USD' }),
      transaction({ id: 'usd-duplicate', date: '2026-08-17T12:00:00', currency: 'USD' }),
      transaction({
        id: 'eur',
        date: '2026-07-01T09:00:00',
        currency: 'EUR',
        type: 'income',
      }),
      transaction({
        id: 'transfer',
        date: '2026-08-17T09:00:00',
        currency: 'GBP',
        type: 'transfer',
      }),
    ];

    expect(
      buildAnalyticsRateRequirements(records, 'THB', new Date(2026, 7, 17, 23, 59)),
    ).toEqual([
      { base: 'THB', quote: 'EUR', date: '2026-07-01' },
      { base: 'THB', quote: 'GBP', date: '2026-08-17' },
      { base: 'THB', quote: 'USD', date: '2026-08-17' },
    ]);
  });

  it('ignores invalid, future, and unusable rows', () => {
    expect(
      buildAnalyticsRateRequirements(
        [
          transaction({ id: 'invalid-date', date: 'not-a-date', currency: 'USD' }),
          transaction({ id: 'future', date: '2026-08-18T10:00:00', currency: 'USD' }),
          transaction({ id: 'nan', date: '2026-08-17T10:00:00', currency: 'USD', amount: Number.NaN }),
          transaction({ id: 'blank', date: '2026-08-17T10:00:00', currency: '' }),
        ],
        'THB',
        new Date(2026, 7, 17, 23, 59),
      ),
    ).toEqual([]);
  });

  it('fingerprints the full requirement set independent of input order', () => {
    const requirements = [
      { base: 'THB', quote: 'USD', date: '2026-08-17' },
      { base: 'THB', quote: 'EUR', date: '2026-07-01' },
    ];

    expect(buildAnalyticsRateRequirementsFingerprint(requirements)).toBe(
      buildAnalyticsRateRequirementsFingerprint([...requirements].reverse()),
    );
    expect(
      buildAnalyticsRateRequirementsFingerprint([
        ...requirements,
        { base: 'THB', quote: 'GBP', date: '2026-08-17' },
      ]),
    ).not.toBe(buildAnalyticsRateRequirementsFingerprint(requirements));
  });
});

describe('buildHistoricalRateResolver', () => {
  it('resolves the closest observation within seven calendar days only', () => {
    const resolve = buildHistoricalRateResolver(
      [
        rate('USD', '2026-08-10', 0.029),
        rate('USD', '2026-08-14', 0.03),
        rate('USD', '2026-08-18', 0.031),
        rate('EUR', '2026-08-09', 0.025),
        rate('USD', '2026-08-17', 1.1, 'EUR'),
      ],
      'THB',
    );

    expect(resolve('USD', '2026-08-17')).toBe(0.03);
    expect(resolve('USD', '2026-08-14')).toBe(0.03);
    expect(resolve('EUR', '2026-08-17')).toBeNull();
    expect(resolve('USD', '2026-08-09')).toBeNull();
  });

  it('ignores invalid observations', () => {
    const resolve = buildHistoricalRateResolver(
      [rate('USD', '2026-08-17', Number.NaN), rate('USD', 'invalid', 0.03)],
      'THB',
    );

    expect(resolve('USD', '2026-08-17')).toBeNull();
  });
});

describe('analytics rate chunking', () => {
  const requirements = [
    { base: 'THB', quote: 'USD', date: '2026-08-17' },
    { base: 'THB', quote: 'EUR', date: '2026-08-10' },
    { base: 'THB', quote: 'USD', date: '2026-07-01' },
  ];

  it('finds unresolved requirements and groups them by transaction month', () => {
    const resolve = buildHistoricalRateResolver([rate('USD', '2026-07-01', 0.03)], 'THB');
    const unresolved = unresolvedAnalyticsRateRequirements(requirements, resolve);

    expect(buildAnalyticsRateChunks(unresolved)).toEqual([
      {
        key: 'THB:2026-08:EUR,USD:2026-08-03:2026-08-17',
        request: {
          base: 'THB',
          quotes: ['EUR', 'USD'],
          from: '2026-08-03',
          to: '2026-08-17',
        },
      },
    ]);
  });

  it('builds one stable local read request over the full requirement span', () => {
    expect(buildAnalyticsRateReadRequest(requirements)).toEqual({
      base: 'THB',
      quotes: ['EUR', 'USD'],
      from: '2026-06-24',
      to: '2026-08-17',
    });
    expect(buildAnalyticsRateReadRequest([])).toBeNull();
  });
});
