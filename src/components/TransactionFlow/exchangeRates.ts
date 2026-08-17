import { z } from 'zod';
import { db } from '../../lib/db';
import type { ExchangeRateRecord } from '../../lib/types';

const FRANKFURTER_RATES_URL = 'https://api.frankfurter.dev/v2/rates';

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

const providerRateSchema = z.object({
  date: isoDateSchema,
  base: z.string().regex(/^[A-Z]{3}$/),
  quote: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().finite().positive(),
});

export type HistoricalRateRequest = {
  base: string;
  quotes: string[];
  from: string;
  to: string;
};

export type ExchangeRateStore = {
  read: (request: HistoricalRateRequest) => Promise<ExchangeRateRecord[]>;
  write: (rates: ExchangeRateRecord[]) => Promise<void>;
};

export type HistoricalRateData = {
  rates: ExchangeRateRecord[];
  updatedAt?: number;
  refreshFailed: boolean;
};

type RateResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

export type RateFetcher = (input: string) => Promise<RateResponse>;

function normalizedQuotes(request: HistoricalRateRequest): string[] {
  return [...new Set(request.quotes.map((quote) => quote.trim()).filter(Boolean))]
    .filter((quote) => quote !== request.base)
    .sort();
}

function dedupeAndSort(rates: ExchangeRateRecord[]): ExchangeRateRecord[] {
  const deduped = new Map<string, ExchangeRateRecord>();
  for (const rate of rates) {
    deduped.set(rate.id, rate);
  }
  return [...deduped.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.quote.localeCompare(right.quote),
  );
}

function withFreshness(
  rates: ExchangeRateRecord[],
  refreshFailed: boolean,
): HistoricalRateData {
  const timestamps = rates
    .map((rate) => Date.parse(rate.fetchedAt))
    .filter((timestamp) => Number.isFinite(timestamp));
  const updatedAt = timestamps.length > 0 ? Math.max(...timestamps) : undefined;
  return updatedAt === undefined
    ? { rates, refreshFailed }
    : { rates, updatedAt, refreshFailed };
}

export async function fetchHistoricalRates(
  request: HistoricalRateRequest,
  fetcher: RateFetcher = (input) => fetch(input),
  now = new Date(),
): Promise<ExchangeRateRecord[]> {
  const quotes = normalizedQuotes(request);
  if (quotes.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    base: request.base,
    quotes: quotes.join(','),
    from: request.from,
    to: request.to,
  });
  const response = await fetcher(`${FRANKFURTER_RATES_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Frankfurter request failed${response.status ? ` (${response.status})` : ''}`);
  }

  const payload = z.array(z.unknown()).parse(await response.json());
  const requestedQuotes = new Set(quotes);
  const fetchedAt = now.toISOString();
  const rates: ExchangeRateRecord[] = [];

  for (const value of payload) {
    const parsed = providerRateSchema.safeParse(value);
    if (!parsed.success) {
      continue;
    }
    const row = parsed.data;
    if (
      row.base !== request.base ||
      !requestedQuotes.has(row.quote) ||
      row.date < request.from ||
      row.date > request.to
    ) {
      continue;
    }
    rates.push({
      id: `${row.base}:${row.quote}:${row.date}`,
      ...row,
      fetchedAt,
    });
  }

  return dedupeAndSort(rates);
}

export const exchangeRateStore: ExchangeRateStore = {
  async read(request) {
    const batches = await Promise.all(
      normalizedQuotes(request).map((quote) =>
        db.exchangeRates
          .where('[base+quote+date]')
          .between(
            [request.base, quote, request.from],
            [request.base, quote, request.to],
            true,
            true,
          )
          .toArray(),
      ),
    );
    return dedupeAndSort(batches.flat());
  },
  async write(rates) {
    if (rates.length > 0) {
      await db.exchangeRates.bulkPut(rates);
    }
  },
};

export async function readHistoricalRates(
  request: HistoricalRateRequest,
  store: ExchangeRateStore = exchangeRateStore,
): Promise<HistoricalRateData> {
  if (normalizedQuotes(request).length === 0) {
    return { rates: [], refreshFailed: false };
  }
  return withFreshness(await store.read(request), false);
}

export type HistoricalRateChunkResult = {
  completed: HistoricalRateRequest[];
  failed: Array<{ request: HistoricalRateRequest; error: Error }>;
};

export async function backfillHistoricalRateChunks(
  requests: HistoricalRateRequest[],
  options: {
    concurrency?: number;
    isOnline?: boolean;
    store?: ExchangeRateStore;
    fetcher?: RateFetcher;
    now?: Date;
    onChunkStored?: (request: HistoricalRateRequest) => void | Promise<void>;
  } = {},
): Promise<HistoricalRateChunkResult> {
  if (options.isOnline === false || requests.length === 0) {
    return { completed: [], failed: [] };
  }

  const store = options.store ?? exchangeRateStore;
  const concurrency = Math.max(
    1,
    Math.min(requests.length, Math.floor(options.concurrency ?? 3)),
  );
  const completed = new Array<boolean>(requests.length).fill(false);
  const failures = new Map<number, Error>();
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < requests.length) {
      const index = nextIndex;
      nextIndex += 1;
      const request = requests[index];
      try {
        const fresh = await fetchHistoricalRates(
          request,
          options.fetcher,
          options.now,
        );
        await store.write(fresh);
        await options.onChunkStored?.(request);
        completed[index] = true;
      } catch (cause) {
        failures.set(
          index,
          cause instanceof Error ? cause : new Error('Historical rate backfill failed'),
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return {
    completed: requests.filter((_, index) => completed[index]),
    failed: requests.flatMap((request, index) => {
      const error = failures.get(index);
      return error ? [{ request, error }] : [];
    }),
  };
}

export async function loadHistoricalRates(
  request: HistoricalRateRequest,
  options: {
    isOnline: boolean;
    store?: ExchangeRateStore;
    fetcher?: RateFetcher;
    now?: Date;
  },
): Promise<HistoricalRateData> {
  if (normalizedQuotes(request).length === 0) {
    return { rates: [], refreshFailed: false };
  }

  const store = options.store ?? exchangeRateStore;
  const cached = (await readHistoricalRates(request, store)).rates;
  if (!options.isOnline) {
    return withFreshness(cached, false);
  }

  try {
    const fresh = await fetchHistoricalRates(request, options.fetcher, options.now);
    await store.write(fresh);
    return withFreshness(dedupeAndSort([...cached, ...fresh]), false);
  } catch (error) {
    if (cached.length > 0) {
      return withFreshness(cached, true);
    }
    throw error;
  }
}

export function findHistoricalQuoteRate(
  rates: ExchangeRateRecord[],
  quote: string,
  date: string,
): number | null {
  let match: ExchangeRateRecord | null = null;
  for (const rate of rates) {
    if (rate.quote !== quote || rate.date > date || !Number.isFinite(rate.rate) || rate.rate <= 0) {
      continue;
    }
    if (!match || rate.date > match.date) {
      match = rate;
    }
  }
  if (!match) return null;
  const requestedAt = Date.parse(`${date}T00:00:00.000Z`);
  const observedAt = Date.parse(`${match.date}T00:00:00.000Z`);
  if (!Number.isFinite(requestedAt) || !Number.isFinite(observedAt)) return null;
  return requestedAt - observedAt <= 7 * 86_400_000 ? match.rate : null;
}
