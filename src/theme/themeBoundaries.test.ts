import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const THEME_MANAGED_FILES = [
  'index.html',
  'tailwind.config.js',
  'vite.config.ts',
  'src/styles/globals.css',
  'src/components/AppShell.tsx',
  'src/components/AppearancePicker.tsx',
  'src/components/SettingsView.tsx',
  'src/components/SwipeableListItem.tsx',
  'src/components/ThemeSetting.tsx',
  'src/components/LandingDemo/SpreadsheetPreview.tsx',
  'src/components/OnboardingFlow/AccountsScreen.tsx',
  'src/components/OnboardingFlow/CategoriesScreen.tsx',
  'src/components/OnboardingFlow/ConnectScreen.tsx',
  'src/components/OnboardingFlow/DoneScreen.tsx',
  'src/components/OnboardingFlow/SheetLocationScreen.tsx',
  'src/components/TransactionFlow/analyticsPresentation.ts',
  'src/routes/LandingPage.tsx',
  'src/lib/icons.ts',
];

const RAW_COLOR = /#[\da-f]{3,8}\b|(?:hsl|rgb)a?\(\s*\d/gi;
const HARDCODED_TAILWIND_COLOR =
  /(?:bg|text|border|ring|from|via|to|stroke|fill)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:\d{2,3})(?:\/\d+)?/gi;
const LEGACY_SEMANTIC_COLOR =
  /(?:bg|text|border|ring)-(?:destructive|secondary)(?:-[\w-]+)?(?:\/\d+)?/gi;

const ALLOWED_THEME_FILES = new Set([
  'src/theme/themeConfig.ts',
  'src/theme/themeConfig.test.ts',
]);

describe('theme boundaries', () => {
  it('keeps managed UI and build files free of palette literals', () => {
    const violations = THEME_MANAGED_FILES.flatMap((file) => {
      if (ALLOWED_THEME_FILES.has(file)) return [];
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      return [RAW_COLOR, HARDCODED_TAILWIND_COLOR, LEGACY_SEMANTIC_COLOR].flatMap(
        (pattern) =>
          [...source.matchAll(pattern)].map((match) => `${file}: ${match[0]}`),
      );
    });

    expect(violations).toEqual([]);
  });
});
