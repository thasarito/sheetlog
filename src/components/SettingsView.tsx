import { Palette } from 'lucide-react';
import { useState } from 'react';
import {
  SettingsView as SettingsViewContent,
  type SettingsViewProps,
} from './SettingsViewContent';
import { ThemeSetting } from './ThemeSetting';

export type { SettingsViewProps } from './SettingsViewContent';

export function SettingsView(props: SettingsViewProps) {
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <div className="relative h-full min-h-0">
      <SettingsViewContent {...props} />
      <div
        data-home-carousel-swipe-lock="true"
        className="absolute bottom-4 right-4 z-40"
      >
        {themeOpen ? (
          <div className="absolute bottom-12 right-0 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-border/70 bg-card">
            <ThemeSetting />
          </div>
        ) : null}
        <button
          type="button"
          aria-label={themeOpen ? 'Close theme settings' : 'Theme settings'}
          aria-expanded={themeOpen}
          onClick={() => setThemeOpen((open) => !open)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-primary active:bg-surface-2"
        >
          <Palette className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
