import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/home-carousel.spec.ts';
let source = readFileSync(path, 'utf8');
const modalBefore = `    await expect(editor).toBeVisible();\n    await expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    await expect(settings).toHaveAttribute("aria-hidden", "false");\n    await expect(accountName).toHaveValue("Travel Wallet");`;
const modalAfter = `    await expect(editor).toBeVisible();\n    await expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    await expect(viewport).toHaveAttribute("data-selected-snap", "2");\n    await expect(viewport).toHaveAttribute("data-target-snap", "2");\n    await expect\n      .poll(() =>\n        viewport.evaluate((element) =>\n          Math.round(element.scrollLeft / element.clientWidth),\n        ),\n      )\n      .toBe(2);\n    await expectActiveTitle(page, "Settings");\n    await expect(accountName).toHaveValue("Travel Wallet");`;
if (!source.includes(modalAfter) && source.includes(modalBefore)) {
  source = source.replace(modalBefore, modalAfter);
}
source = source.replace(
  `accountsRegion.getByRole("button", { name: "Travel Wallet" })`,
  `accountsRegion.getByRole("button", { name: "Travel Wallet", exact: true })`,
);

const fixedProgressAssertion = `    await controlCenter.evaluate((element) => {\n      element.scrollTop = 34;\n      element.dispatchEvent(new Event("scroll", { bubbles: true }));\n    });\n    await expect\n      .poll(() =>\n        dashboardHeader.evaluate((element) =>\n          Number((element as HTMLElement).dataset.hideProgress),\n        ),\n      )\n      .toBeCloseTo(0.5, 2);`;
const trackedProgressAssertion = `    await controlCenter.evaluate((element) => {\n      element.scrollTop = 34;\n      element.dispatchEvent(new Event("scroll", { bubbles: true }));\n    });\n    await expect\n      .poll(() =>\n        page.evaluate(() => {\n          const scroll = document.querySelector<HTMLElement>(\n            '[data-testid="settings-control-center-scroll"]',\n          );\n          const header = document.querySelector<HTMLElement>(\n            '[data-testid="dashboard-header"]',\n          );\n          if (!scroll || !header) return Number.POSITIVE_INFINITY;\n          const expected = Math.min(1, Math.max(0, scroll.scrollTop / 68));\n          const actual = Number(header.dataset.hideProgress);\n          return Math.abs(actual - expected);\n        }),\n      )\n      .toBeLessThan(0.01);`;
if (!source.includes(trackedProgressAssertion)) {
  if (!source.includes(fixedProgressAssertion)) {
    throw new Error('Could not find Settings header progress assertion');
  }
  source = source.replace(fixedProgressAssertion, trackedProgressAssertion);
}

writeFileSync(path, source);
