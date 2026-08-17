import { format, subDays } from 'date-fns';
import { tryParseDate } from '../../lib/date-utils';
import type { ExchangeRateRecord, TransactionRecord } from '../../lib/types';
import type { HistoricalRateRequest } from './exchangeRates';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RATE_LOOKBACK_DAYS = 7;

export type AnalyticsRateRequirement = {
  base: string;
  quote: string;
  date: string;
};

export type AnalyticsRateChunk = {
  key: string;
  request: HistoricalRateRequest;
};

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function dateTimestamp(date: string): number | null {
  if (!ISO_DATE_PATTERN.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function requirementSort(
  left: AnalyticsRateRequirement,
  right: AnalyticsRateRequirement,
): number {
  return (
    left.base.localeCompare(right.base) ||
    left.quote.localeCompare(right.quote) ||
    left.date.localeCompare(right.date)
  );
}

function hashRequirementParts(
  requirements: readonly AnalyticsRateRequirement[],
  seed: number,
): string {
  let hash = seed;
  for (const requirement of [...requirements].sort(requirementSort)) {
    const value = `${requirement.base}\0${requirement.quote}\0${requirement.date}\n`;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildAnalyticsRateRequirementsFingerprint(
  requirements: readonly AnalyticsRateRequirement[],
): string {
  const left = hashRequirementParts(requirements, 2_166_136_261);
  const right = hashRequirementParts(requirements, 2_654_435_769);
  return `${requirements.length}:${left}${right}`;
}

export function buildAnalyticsRateRequirements(
  transactions: TransactionRecord[],
  baseCurrency: string,
  today = new Date(),
): AnalyticsRateRequirement[] {
  const base = normalizeCurrency(baseCurrency);
  const todayKey = format(today, 'yyyy-MM-dd');
  const unique = new Map<string, AnalyticsRateRequirement>();

  for (const transaction of transactions) {
    if (!Number.isFinite(transaction.amount)) continue;
    const quote = normalizeCurrency(transaction.currency);
    if (!base || !quote || quote === base) continue;
    const parsed = tryParseDate(transaction.date);
    if (!parsed) continue;
    const date = format(parsed, 'yyyy-MM-dd');
    if (date > todayKey) continue;
    const requirement = { base, quote, date };
    unique.set(`${base}:${quote}:${date}`, requirement);
  }

  return [...unique.values()].sort(requirementSort);
}

export function buildHistoricalRateResolver(
  rates: readonly ExchangeRateRecord[],
  baseCurrency: string,
): (quote: string, date: string) => number | null {
  const base = normalizeCurrency(baseCurrency);
  const byQuote = new Map<string, ExchangeRateRecord[]>();

  for (const rate of rates) {
    const quote = normalizeCurrency(rate.quote);
    if (
      normalizeCurrency(rate.base) !== base ||
      !quote ||
      dateTimestamp(rate.date) === null ||
      !Number.isFinite(rate.rate) ||
      rate.rate <= 0
    ) {
      continue;
    }
    const quoteRates = byQuote.get(quote) ?? [];
    quoteRates.push(rate);
    byQuote.set(quote, quoteRates);
  }

  for (const quoteRates of byQuote.values()) {
    quoteRates.sort((left, right) => left.date.localeCompare(right.date));
  }

  return (quoteValue, date) => {
    const target = dateTimestamp(date);
    if (target === null) return null;
    const quoteRates = byQuote.get(normalizeCurrency(quoteValue));
    if (!quoteRates || quoteRates.length === 0) return null;

    let low = 0;
    let high = quoteRates.length - 1;
    let match: ExchangeRateRecord | undefined;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = quoteRates[middle];
      if (candidate.date <= date) {
        match = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (!match) return null;
    const observedAt = dateTimestamp(match.date);
    if (observedAt === null) return null;
    const ageInDays = Math.floor((target - observedAt) / 86_400_000);
    return ageInDays >= 0 && ageInDays <= MAX_RATE_LOOKBACK_DAYS
      ? match.rate
      : null;
  };
}

export function unresolvedAnalyticsRateRequirements(
  requirements: AnalyticsRateRequirement[],
  resolveRate: (quote: string, date: string) => number | null,
): AnalyticsRateRequirement[] {
  return requirements.filter(
    (requirement) => resolveRate(requirement.quote, requirement.date) === null,
  );
}

export function buildAnalyticsRateChunks(
  requirements: AnalyticsRateRequirement[],
): AnalyticsRateChunk[] {
  const groups = new Map<string, AnalyticsRateRequirement[]>();
  for (const requirement of requirements) {
    if (dateTimestamp(requirement.date) === null) continue;
    const month = requirement.date.slice(0, 7);
    const groupKey = `${requirement.base}:${month}`;
    const group = groups.get(groupKey) ?? [];
    group.push(requirement);
    groups.set(groupKey, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupKey, group]) => {
      const dates = group.map(({ date }) => date).sort();
      const quotes = [...new Set(group.map(({ quote }) => quote))].sort();
      const base = group[0]?.base ?? '';
      const earliest = dates[0];
      const to = dates.at(-1) ?? earliest;
      const from = format(subDays(new Date(`${earliest}T00:00:00`), 7), 'yyyy-MM-dd');
      return {
        key: `${groupKey}:${quotes.join(',')}:${from}:${to}`,
        request: { base, quotes, from, to },
      };
    });
}

export function buildAnalyticsRateReadRequest(
  requirements: AnalyticsRateRequirement[],
): HistoricalRateRequest | null {
  if (requirements.length === 0) return null;
  const sorted = [...requirements].sort(requirementSort);
  const base = sorted[0]?.base;
  const scoped = sorted.filter((requirement) => requirement.base === base);
  const dates = scoped.map(({ date }) => date).sort();
  const earliest = dates[0];
  const to = dates.at(-1) ?? earliest;
  if (!base || !earliest || !to) return null;
  return {
    base,
    quotes: [...new Set(scoped.map(({ quote }) => quote))].sort(),
    from: format(subDays(new Date(`${earliest}T00:00:00`), 7), 'yyyy-MM-dd'),
    to,
  };
}
