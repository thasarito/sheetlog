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
writeFileSync(path, source);
