import { spawn } from 'node:child_process';
import process from 'node:process';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = new URL('../', import.meta.url).pathname;
const VITE_BIN = new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname;
const PORT = 53741;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const NOW = new Date('2026-08-17T12:00:00.000Z');
const CPU_BASELINES_MS = { W: 119.8, M: 131.3, Q: 145.5, Y: 239.7, C: 208.8 };

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function makeBrowserTransactions() {
  const categories = [
    'Food Delivery',
    'Dining Out',
    'Groceries & Home Supplies',
    'Transport',
    'Travel',
    'Subscriptions',
  ];
  const rows = [];
  const start = new Date(Date.UTC(2025, 0, 1, 12));
  const end = new Date(Date.UTC(2026, 7, 17, 12));
  let day = 0;

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString();
    const dateKey = date.slice(0, 10);
    const common = {
      type: 'expense',
      for: 'Self',
      date,
      status: 'synced',
      createdAt: date,
      updatedAt: date,
      sheetId: 'mock-sheet-id-dev',
      sheetRowValid: true,
    };
    rows.push({
      ...common,
      id: `thb-${dateKey}`,
      amount: 120 + (day % 17) * 13,
      currency: 'THB',
      account: day % 2 === 0 ? 'Cash' : 'Bank',
      category: categories[day % categories.length],
      note: 'Daily THB expense',
    });
    rows.push({
      ...common,
      id: `usd-${dateKey}`,
      amount: 4 + (day % 11),
      currency: 'USD',
      account: 'Credit Card',
      category: categories[(day + 2) % categories.length],
      note: 'Daily USD expense',
    });
    if (cursor.getUTCDate() === 1) {
      rows.push({
        ...common,
        id: `income-${dateKey}`,
        type: 'income',
        amount: 60_000,
        currency: 'THB',
        account: 'Bank',
        category: 'Salary',
        note: 'Monthly salary',
      });
    }
    day += 1;
  }
  return rows;
}

async function waitForServer(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before benchmark startup (${child.exitCode})`);
    }
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the analytics benchmark server');
}

async function runBrowserBenchmark() {
  const server = spawn(
    process.execPath,
    [VITE_BIN, 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_DEV_MODE: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let serverError = '';
  server.stderr.on('data', (chunk) => {
    serverError += String(chunk);
  });

  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const transactions = makeBrowserTransactions();
    if (
      transactions.length !== 1_208 ||
      transactions.filter(
        (row) => row.type === 'expense' && row.currency === 'USD',
      ).length !== 594
    ) {
      throw new Error('Browser benchmark fixture no longer matches the baseline');
    }
    await page.addInitScript((rows) => {
      window.localStorage.setItem('sheetlog.mock.transactions', JSON.stringify(rows));
      window.localStorage.setItem(
        'sheetlog.mock.analyticsBaseCurrency',
        JSON.stringify({
          currency: 'THB',
          updatedAt: '2026-08-17T00:00:00.000Z',
        }),
      );
      window.localStorage.setItem(
        'sheetlog.mock.analyticsBigSpendingThreshold',
        JSON.stringify({
          amount: null,
          currency: 'THB',
          updatedAt: '2026-08-17T00:00:00.000Z',
        }),
      );
    }, transactions);

    let frankfurterRequests = 0;
    await page.route('https://api.frankfurter.dev/v2/rates**', async (route) => {
      frankfurterRequests += 1;
      const url = new URL(route.request().url());
      const base = url.searchParams.get('base') ?? 'THB';
      const quotes = (url.searchParams.get('quotes') ?? '').split(',').filter(Boolean);
      const from = url.searchParams.get('from') ?? '2025-01-01';
      const to = url.searchParams.get('to') ?? '2026-08-17';
      const rows = [];
      for (
        let timestamp = Date.parse(`${from}T00:00:00.000Z`);
        timestamp <= Date.parse(`${to}T00:00:00.000Z`) && timestamp <= NOW.getTime();
        timestamp += 86_400_000
      ) {
        const date = new Date(timestamp).toISOString().slice(0, 10);
        for (const [quoteIndex, quote] of quotes.entries()) {
          rows.push({ date, base, quote, rate: 0.025 + quoteIndex * 0.015 });
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
    });

    await page.goto(`${BASE_URL}/app`);
    await page.getByRole('region', { name: 'Home activity' }).waitFor();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByText(/^Synced · /).waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Analytics slide' }).click();
    const requestsAfterSync = frankfurterRequests;
    const samples = { W: [], M: [], Q: [], Y: [], C: [] };

    const settle = () =>
      page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    const select = async (short, label) => {
      const button = page.getByRole('button', { name: label, exact: true });
      const startedAt = performance.now();
      await button.click();
      await button.evaluate((element) => {
        if (element.getAttribute('aria-pressed') !== 'true') {
          throw new Error('Range selection did not commit');
        }
      });
      await settle();
      samples[short].push(performance.now() - startedAt);
    };
    const selectCustom = async () => {
      const button = page.getByRole('button', { name: 'Custom date range' });
      const buttonHandle = await button.elementHandle();
      if (!buttonHandle) throw new Error('Custom range trigger is missing');
      await button.click();
      const apply = page.getByRole('button', { name: 'Apply custom range' });
      const elapsed = await buttonHandle.evaluate(async (element, applyElement) => {
        if (!(applyElement instanceof HTMLButtonElement)) {
          throw new Error('Custom range apply action is missing');
        }
        const startedAt = performance.now();
        applyElement.click();
        while (element.getAttribute('aria-pressed') !== 'true') {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return performance.now() - startedAt;
      }, await apply.elementHandle());
      samples.C.push(elapsed);
      await page
        .getByRole('dialog', { name: 'Custom date range' })
        .waitFor({ state: 'hidden' });
    };

    for (let sample = 0; sample < 7; sample += 1) {
      await select('W', 'Week');
      await select('M', 'Month');
      await select('Q', 'Quarter');
      await select('Y', 'Year');
      await selectCustom();
    }

    await context.close();
    return {
      rowCount: transactions.length,
      initialFrankfurterRequests: requestsAfterSync,
      warmFrankfurterRequests: frankfurterRequests - requestsAfterSync,
      ranges: Object.fromEntries(
        Object.entries(samples).map(([range, timings]) => [
          range,
          {
            medianMs: median(timings),
            p95Ms: percentile(timings, 0.95),
          },
        ]),
      ),
    };
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve();
      else server.once('exit', resolve);
      setTimeout(resolve, 2_000);
    });
    if (server.exitCode && server.exitCode !== 143) {
      process.stderr.write(serverError);
    }
  }
}

async function runCpuBenchmark() {
  const source = `
    import { performance } from 'node:perf_hooks';
    import { buildAnalyticsPeriodOptions, buildAnalyticsSummary } from './src/components/TransactionFlow/analytics.ts';
    const NOW = new Date('2026-08-17T12:00:00.000Z');
    const START = Date.parse('2017-01-01T12:00:00.000Z');
    const END = NOW.getTime();
    const currencies = ['THB', 'USD', 'EUR', 'JPY', 'GBP'];
    const types = ['expense', 'income', 'transfer'];
    const ranges = [
      ['W', 'week'], ['M', 'month'], ['Q', 'quarter'], ['Y', 'year'],
      ['C', 'custom', { start: new Date('2026-02-01T00:00:00.000Z'), end: NOW }],
    ];
    const transactions = Array.from({ length: 50_000 }, (_, index) => {
      const date = new Date(START + Math.floor(((END - START) * index) / 49_999)).toISOString();
      return {
        id: 'cpu-' + index,
        type: types[index % types.length],
        amount: 10 + ((index * 7919) % 75000) / 100,
        currency: currencies[(index * 7) % currencies.length],
        account: 'Cash', for: 'Me', category: 'Dining', date,
        status: 'synced', createdAt: date, updatedAt: date,
      };
    });
    const rates = [];
    for (let timestamp = Date.parse('2016-12-25T00:00:00.000Z'); timestamp <= END; timestamp += 86_400_000) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      for (const [index, quote] of currencies.slice(1).entries()) {
        rates.push({ id: 'THB:' + quote + ':' + date, base: 'THB', quote, date, rate: 0.025 + index * 0.015, fetchedAt: NOW.toISOString() });
      }
    }
    const result = {};
    for (const [short, range, customPeriod] of ranges) {
      const run = () => {
        const options = buildAnalyticsPeriodOptions(range, transactions, NOW);
        const summary = buildAnalyticsSummary({ transactions, range, baseCurrency: 'THB', rates, now: NOW, customPeriod });
        if (summary.status !== 'ready') throw new Error('Unexpected analytics result');
        return options.length + summary.summary.buckets.length;
      };
      for (let warm = 0; warm < 5; warm += 1) run();
      const samples = [];
      for (let sample = 0; sample < 15; sample += 1) {
        const startedAt = performance.now();
        run();
        samples.push(performance.now() - startedAt);
      }
      samples.sort((left, right) => left - right);
      result[short] = { medianMs: samples[7], p95Ms: samples[14] };
    }
    export default result;
  `;
  const built = await build({
    stdin: { contents: source, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const encoded = Buffer.from(built.outputFiles[0].text).toString('base64');
  return (await import(`data:text/javascript;base64,${encoded}`)).default;
}

const browserResult = await runBrowserBenchmark();
const cpuResult = await runCpuBenchmark();

process.stdout.write(`${JSON.stringify({ browser: browserResult, cpu: cpuResult }, null, 2)}\n`);

const failures = [];
for (const [range, result] of Object.entries(browserResult.ranges)) {
  if (result.medianMs > 250) failures.push(`${range} browser median ${result.medianMs.toFixed(1)}ms`);
}
if (browserResult.warmFrankfurterRequests !== 0) {
  failures.push(`${browserResult.warmFrankfurterRequests} FX requests during warm range selection`);
}
for (const [range, result] of Object.entries(cpuResult)) {
  if (result.medianMs > CPU_BASELINES_MS[range] * 1.1) {
    failures.push(`${range} CPU median ${result.medianMs.toFixed(1)}ms exceeds baseline tolerance`);
  }
}
if (failures.length > 0) {
  throw new Error(`Analytics benchmark failed:\n- ${failures.join('\n- ')}`);
}
