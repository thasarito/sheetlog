import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  return {
    base: normalizedBase,
    plugins: [
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
          background_color: "#ffffff",
          theme_color: "#ffffff",
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
  };
});
