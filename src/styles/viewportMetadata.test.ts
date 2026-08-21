import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);
const viteConfig = readFileSync(
  new URL("../../vite.config.ts", import.meta.url),
  "utf8",
);

describe("iOS viewport metadata", () => {
  it("removes the unsupported interactive-widget argument from served HTML", () => {
    expect(indexHtml).toContain("interactive-widget=overlays-content");
    expect(viteConfig).toContain(
      '.replace(", interactive-widget=overlays-content", "")',
    );
  });

  it("preserves the selected translucent standalone status-bar mode", () => {
    expect(indexHtml).toMatch(
      /name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
    );
  });
});
