import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/home-carousel.spec.ts';
let source = readFileSync(path, 'utf8');

const replacements = [
  [
    'await settings.getByRole("button", { name: /^Accounts/ }).click();',
    'await settings.locator("#settings-section-accounts > button").click();',
  ],
  [
    'await settings.getByRole("button", { name: /^Categories/ }).click();',
    'await settings.locator("#settings-section-categories > button").click();',
  ],
  [
    'const accountsRegion = settings.getByRole("region", { name: "Accounts" });',
    'const accountsRegion = settings.locator("#settings-section-accounts-content");',
  ],
  [
    'const categoriesRegion = settings.getByRole("region", {\n      name: "Categories",\n    });',
    'const categoriesRegion = settings.locator("#settings-section-categories-content");',
  ],
  [
    'await settings.getByRole("button", { name: /^Data & sync/ }).click();',
    'await settings.locator("#settings-section-data-sync > button").click();',
  ],
  [
    'const categorySheet = page.getByRole("dialog", {\n      name: "Transaction entry",\n    });',
    'const categorySheet = page.getByTestId("category-step-layout");',
  ],
  [
    'await expect(page.getByRole("dialog")).toHaveCount(2);',
    'await expect(page.locator(\'[role="dialog"]\')).toHaveCount(2);',
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(before)) source = source.replace(before, after);
}

writeFileSync(path, source);
