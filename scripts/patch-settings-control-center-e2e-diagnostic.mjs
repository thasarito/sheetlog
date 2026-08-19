import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/home-carousel.spec.ts';
let source = readFileSync(path, 'utf8');
const before = `    await accountName.fill("Travel Wallet");\n    await touchSwipe(page, accountName, -180, 2);\n    await expect(settings).toHaveAttribute("aria-hidden", "false");`;
const after = `    await accountName.fill("Travel Wallet");\n    await touchSwipe(page, accountName, -180, 2);\n    await expect(editor).toBeVisible();\n    await expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    await expect(settings).toHaveAttribute("aria-hidden", "false");`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Could not find post-touch assertion point');
  source = source.replace(before, after);
}
writeFileSync(path, source);
