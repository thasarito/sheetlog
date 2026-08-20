import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme';
import { AnalyticsBaseCurrencySetting } from './AnalyticsBaseCurrencySetting';
import { AnalyticsBigSpendingThresholdSetting } from './AnalyticsBigSpendingThresholdSetting';
import { AnalyticsSyncSetting } from './AnalyticsSyncSetting';
import { ThemeSetting } from './ThemeSetting';

describe('Settings icon badges', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-color-mode');
  });

  it('marks every standard focused Settings leading icon with one badge variant', () => {
    const { container } = render(
      <ThemeProvider>
        <div>
          <ThemeSetting />
          <AnalyticsBaseCurrencySetting value="THB" disabled={false} onChange={vi.fn()} />
          <AnalyticsBigSpendingThresholdSetting
            currency="THB"
            value={null}
            disabled={false}
            onCommit={vi.fn()}
            onInvalid={vi.fn()}
          />
          <AnalyticsSyncSetting
            transactionCount={12}
            historyCapturedAt="2026-08-20T03:00:00.000Z"
            isHistoryLoading={false}
            isHistoryDownloading={false}
            isHistoryRefreshing={false}
            status="synced"
            isResyncing={false}
            onResync={vi.fn()}
          />
        </div>
      </ThemeProvider>,
    );

    expect(container.querySelectorAll('[data-settings-icon-badge]')).toHaveLength(5);
  });

  it('scopes the accent treatment to standard Control Center badges', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const settingsView = readFileSync(
      resolve(process.cwd(), 'src/components/SettingsViewContent.tsx'),
      'utf8',
    );

    expect(css).toContain('.settings-icon-badge');
    expect(css).toContain('section[aria-label="Workspace health"]');
    expect(css).toContain('#settings-section-data-sync-content');
    expect(css).toContain('#settings-section-quick-notes-content');
    expect(css).not.toContain('#settings-section-accounts-content');
    expect(css).not.toContain('#settings-section-categories-content');
    expect(settingsView).toContain('backgroundColor: account.color');
    expect(settingsView).toContain('backgroundColor: category.color');
  });
});
