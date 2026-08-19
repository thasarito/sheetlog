import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/home-carousel.spec.ts';
let source = readFileSync(path, 'utf8');
const before = `    await expect(editor).toBeVisible();\n    await expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    await expect(settings).toHaveAttribute("aria-hidden", "false");\n    await expect(accountName).toHaveValue("Travel Wallet");`;
const after = `    await expect(editor).toBeVisible();\n    await expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    await expect(viewport).toHaveAttribute("data-selected-snap", "2");\n    await expect(viewport).toHaveAttribute("data-target-snap", "2");\n    await expect\n      .poll(() =>\n        viewport.evaluate((element) =>\n          Math.round(element.scrollLeft / element.clientWidth),\n        ),\n      )\n      .toBe(2);\n    await expectActiveTitle(page, "Settings");\n    await expect(accountName).toHaveValue("Travel Wallet");`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Could not find nested-modal carousel assertion');
  source = source.replace(before, after);
}
writeFileSync(path, source);
