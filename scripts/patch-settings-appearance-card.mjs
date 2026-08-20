import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/components/SettingsViewContent.tsx';
let source = readFileSync(path, 'utf8');

const analyticsImport =
  "import type { AnalyticsSyncController } from './TransactionFlow/useAnalyticsSync';";
const themeImport = "import { ThemeSetting } from './ThemeSetting';";

if (!source.includes(themeImport)) {
  if (!source.includes(analyticsImport)) {
    throw new Error('Could not find AnalyticsSyncController import');
  }
  source = source.replace(analyticsImport, `${themeImport}\n${analyticsImport}`);
}

const analyticsHeading = `          <div className="px-1 pt-2">\n            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">\n              Analytics preferences\n            </p>\n          </div>`;
const appearanceCard = `          <div className="px-1 pt-2">\n            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">\n              Appearance\n            </p>\n          </div>\n          <section\n            aria-label="Appearance"\n            className="overflow-hidden rounded-[20px] border border-border/70 bg-card"\n          >\n            <ThemeSetting />\n          </section>`;

if (!source.includes('aria-label="Appearance"')) {
  if (!source.includes(analyticsHeading)) {
    throw new Error('Could not find Analytics preferences heading');
  }
  source = source.replace(analyticsHeading, `${appearanceCard}\n\n${analyticsHeading}`);
}

writeFileSync(path, source);
