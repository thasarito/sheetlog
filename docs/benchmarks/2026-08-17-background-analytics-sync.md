# Background Analytics Sync Benchmark

Date: 2026-08-17

Environment: AMD EPYC-Genoa Processor, Node 22.22.0, Playwright 1.57.0 Chromium, UTC. Browser measurements use a 390×844 viewport and 1,208 deterministic transactions from 2025-01-01 through 2026-08-17. CPU measurements use 50,000 deterministic transactions from 2017-01-01 through 2026-08-17.

Command:

```bash
node scripts/benchmark-analytics.mjs
```

## Browser range selection

The baseline measured cold click-to-ready with range-specific Frankfurter loading. The result measures range selection after the new background sync has completed. A separate delayed-network Playwright contract verifies that ranges remain usable with partial local totals while the initial background fill is still pending.

| Range | Before median | After median | Change |
| --- | ---: | ---: | ---: |
| Week | 1,613.2 ms | 103.9 ms | -93.6% |
| Month | 1,592.0 ms | 116.8 ms | -92.7% |
| Quarter | 1,221.1 ms | 116.9 ms | -90.4% |
| Year | 4,759.7 ms | 149.6 ms | -96.9% |
| Custom | 9,570.5 ms | 68.3 ms | -99.3% |

The initial full-history fill made 20 month-scoped Frankfurter requests, capped at three concurrent requests. W/M/Q/Y/C selection after that fill made **zero** Frankfurter requests.

## 50,000-row CPU pipeline

This measures period-option construction plus the production summary builder. The new builder creates a per-quote sorted rate index once and uses bounded binary searches rather than rescanning the entire rate list per foreign row.

| Range | Before median | After median | Change |
| --- | ---: | ---: | ---: |
| Week | 119.8 ms | 72.2 ms | -39.7% |
| Month | 131.3 ms | 76.5 ms | -41.7% |
| Quarter | 145.5 ms | 80.8 ms | -44.5% |
| Year | 239.7 ms | 129.8 ms | -45.8% |
| Custom | 208.8 ms | 108.7 ms | -47.9% |

## Acceptance results

- All browser range medians are below the 250 ms budget.
- Warm range selection performs zero FX network requests.
- Every 50,000-row CPU median is below its pre-change baseline.
- The delayed-FX browser test shows the base-currency partial result immediately, then automatically includes the foreign row when its rate is stored.
- Settings stays interactive throughout and reports `Syncing…`, then `Synced · <time>`; manual Resync triggers a fresh background fill.
