import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const indexHtml = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);

describe("iOS standalone safe-area presentation", () => {
  it("uses the category sheet card color for the system-owned bottom strip", () => {
    expect(globalsCss).toContain(
      'html:has([data-testid="category-step-layout"])',
    );
    expect(globalsCss).toContain("background-color: hsl(var(--card));");
    expect(globalsCss).toContain(
      'html:has([data-testid="category-step-layout"]) body::before',
    );
    expect(globalsCss).toContain("height: env(safe-area-inset-top, 0px);");
    expect(globalsCss).toContain(
      'html:has([data-testid="category-step-layout"]) #root',
    );
  });

  it("does not send unsupported interactive-widget metadata to iOS", () => {
    expect(indexHtml).not.toContain("interactive-widget=");
    expect(indexHtml).toContain(
      'name="apple-mobile-web-app-status-bar-style" content="black-translucent"',
    );
  });
});
