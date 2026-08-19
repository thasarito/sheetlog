import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeId,
  type ThemeMode,
} from "./themeConfig";
import { getThemeCssVariables } from "./core";
import { DARK_MODE_MEDIA_QUERY } from "./runtime";

type InlineThemeMode = {
  background: string;
  variables: Record<string, string>;
};

type InlineThemePayload = {
  defaultPreference: typeof DEFAULT_THEME_PREFERENCE;
  mediaQuery: string;
  storageKey: string;
  themes: Record<ThemeId, Record<ThemeMode, InlineThemeMode>>;
};

function createPayload(): InlineThemePayload {
  return {
    defaultPreference: DEFAULT_THEME_PREFERENCE,
    mediaQuery: DARK_MODE_MEDIA_QUERY,
    storageKey: THEME_STORAGE_KEY,
    themes: Object.fromEntries(
      Object.entries(THEMES).map(([themeId, theme]) => [
        themeId,
        Object.fromEntries(
          (Object.keys(theme.modes) as ThemeMode[]).map((mode) => [
            mode,
            {
              background: theme.modes[mode].background,
              variables: getThemeCssVariables(theme.modes[mode]),
            },
          ]),
        ),
      ]),
    ) as InlineThemePayload["themes"],
  };
}

export function createInlineThemeScript(): string {
  const payload = JSON.stringify(createPayload()).replaceAll("<", "\\u003c");
  return `(()=>{try{const c=${payload};let p={...c.defaultPreference};try{const s=JSON.parse(localStorage.getItem(c.storageKey)||"null");if(s&&typeof s==="object"){if(Object.prototype.hasOwnProperty.call(c.themes,s.themeId))p.themeId=s.themeId;if(s.mode==="system"||s.mode==="light"||s.mode==="dark")p.mode=s.mode}}catch{}const m=p.mode==="system"?(matchMedia(c.mediaQuery).matches?"dark":"light"):p.mode;const t=c.themes[p.themeId][m];const r=document.documentElement;for(const [n,v] of Object.entries(t.variables))r.style.setProperty(n,v);r.dataset.theme=p.themeId;r.dataset.colorMode=m;r.dataset.themeReady="true";r.style.colorScheme=m;let meta=document.querySelector('meta[data-sheetlog-theme-color]');if(!meta){meta=document.createElement("meta");meta.name="theme-color";meta.dataset.sheetlogThemeColor="";document.head.append(meta)}meta.content=t.background}catch{}})();`;
}
