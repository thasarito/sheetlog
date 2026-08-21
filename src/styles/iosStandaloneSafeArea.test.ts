import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const indexHtml = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);
const viteConfig = readFileSync(
  new URL("../../vite.config.ts", import.meta.url),
  "utf8",
);

describe("iOS standalone safe-area presentation", () => {
  it("uses the category sheet card color for the system-owned bottom strip", () => {
    expect(globalsCss).toContain(
      "html:has([data-category-sheet-state])",
    );
    expect(globalsCss).toContain("background-color: hsl(var(--card));");
    expect(globalsCss).toContain("background-image: linear-gradient(");
    expect(globalsCss).toContain("env(safe-area-inset-top, 0px)");
    expect(globalsCss).toContain(
      "html:has([data-category-sheet-state]) #root",
    );
    expect(globalsCss).not.toContain(
      "html:has([data-category-sheet-state]) body::before",
    );
  });

  it("removes unsupported interactive-widget metadata from production HTML", () => {
    expect(viteConfig).toContain(
      '.replace(", interactive-widget=overlays-content", "")',
    );
    expect(indexHtml).toMatch(
      /name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
    );
  });
});
