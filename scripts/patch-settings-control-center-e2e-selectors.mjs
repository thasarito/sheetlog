import { readFileSync, writeFileSync } from 'node:fs';

function replaceIfPresent(source, before, after) {
  return source.includes(before) ? source.replace(before, after) : source;
}

const e2ePath = 'e2e/home-carousel.spec.ts';
let e2e = readFileSync(e2ePath, 'utf8');
const selectorReplacements = [
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
  [
    'const editor = page.getByRole("dialog", { name: "New Account" });',
    'const editor = page.locator(\'[role="dialog"]\').filter({\n      has: page.getByRole("textbox", { name: "Account name" }),\n    });',
  ],
  [
    'const invalidEditor = page.getByRole("dialog", { name: "New Account" });',
    'const invalidEditor = page.locator(\'[role="dialog"]\').filter({\n      has: page.getByRole("textbox", { name: "Account name" }),\n    });',
  ],
];
for (const [before, after] of selectorReplacements) {
  e2e = replaceIfPresent(e2e, before, after);
}
writeFileSync(e2ePath, e2e);

const editorFiles = [
  {
    path: 'src/components/SettingsItemEditorDrawer.tsx',
    className: 'max-h-[96dvh] overflow-hidden',
  },
  {
    path: 'src/components/SettingsQuickNoteEditorDrawer.tsx',
    className: 'max-h-[98dvh] overflow-hidden',
  },
];
for (const { path, className } of editorFiles) {
  let source = readFileSync(path, 'utf8');
  source = replaceIfPresent(
    source,
    `      <DrawerContent\n        data-home-carousel-swipe-lock="true"\n        className="${className}"\n      >`,
    `      <DrawerContent\n        data-home-carousel-swipe-lock="true"\n        className="${className}"\n        style={{ touchAction: 'pan-y' }}\n      >`,
  );
  writeFileSync(path, source);
}

const testFiles = [
  {
    path: 'src/components/SettingsItemEditorDrawer.test.tsx',
    rootTestId: 'nested-drawer-root',
  },
  {
    path: 'src/components/SettingsQuickNoteEditorDrawer.test.tsx',
    rootTestId: 'quick-note-nested-root',
  },
];
for (const { path, rootTestId } of testFiles) {
  let source = readFileSync(path, 'utf8');
  source = replaceIfPresent(
    source,
    `  DrawerContent: ({ children }: { children: React.ReactNode }) => (\n    <div role="dialog">{children}</div>\n  ),`,
    `  DrawerContent: ({\n    children,\n    ...props\n  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (\n    <div role="dialog" {...props}>\n      {children}\n    </div>\n  ),`,
  );
  source = replaceIfPresent(
    source,
    `    expect(screen.getByTestId('${rootTestId}')).toBeInTheDocument();`,
    `    expect(screen.getByTestId('${rootTestId}')).toBeInTheDocument();\n    expect(screen.getByRole('dialog')).toHaveStyle({ touchAction: 'pan-y' });`,
  );
  writeFileSync(path, source);
}
