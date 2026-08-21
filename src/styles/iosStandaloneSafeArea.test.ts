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
  it("lets fixed inset positioning own the standalone viewport height", () => {
    const bodyClass = indexHtml.match(/<body\s+class="([^"]+)"/)?.[1];

    expect(bodyClass).toContain("fixed");
    expect(bodyClass).toContain("inset-0");
    expect(bodyClass).not.toContain("h-[100dvh]");
    expect(globalsCss).not.toContain(
      "html:has([data-category-sheet-state])",
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
