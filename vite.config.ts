/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { createInlineThemeScript } from "./src/theme/inlineThemeScript";
import {
  DEFAULT_THEME_ID,
  THEMES,
} from "./src/theme/themeConfig";

const DEFAULT_PWA_COLOR = THEMES[DEFAULT_THEME_ID].modes.light.background;

function sheetlogThemeBootstrap(): Plugin {
  return {
    name: "sheetlog-theme-bootstrap",
    enforce: "pre",
    transformIndexHtml(html) {
      return html
        .replaceAll("__SHEETLOG_THEME_COLOR__", DEFAULT_PWA_COLOR)
        .replace("__SHEETLOG_THEME_BOOTSTRAP__", createInlineThemeScript());
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  return {
    base: normalizedBase,
    plugins: [
      sheetlogThemeBootstrap(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        devOptions: {
          enabled: true,
        },
        includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
        manifest: {
          name: "SheetLog",
          short_name: "SheetLog",
          start_url: `${normalizedBase}app`,
          display: "standalone",
          orientation: "portrait",
          background_color: DEFAULT_PWA_COLOR,
          theme_color: DEFAULT_PWA_COLOR,
          icons: [
            {
              src: "manifest-icon-192.maskable.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "manifest-icon-192.maskable.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "manifest-icon-512.maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "manifest-icon-512.maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          cleanupOutdatedCaches: true,
          // Don't cache index.html by default to ensure updates are detected?
          // improved: VitePWA handles this. We actually want index.html cached but refreshed.
        },
      }),
    ],
    test: {
      environment: "jsdom",
      exclude: ["node_modules/**", ".worktrees/**", "dist/**", "e2e/**"],
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
    },
  };
});
