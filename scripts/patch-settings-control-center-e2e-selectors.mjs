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

const carouselTestPath = 'src/components/TransactionFlow/HomeDashboardCarousel.test.tsx';
let carouselTest = readFileSync(carouselTestPath, 'utf8');
carouselTest = replaceIfPresent(
  carouselTest,
  `  SettingsView: (props: SettingsViewProps) => {\n    settingsViewCalls.push(props);\n    return (`,
  `  SettingsView: (props: SettingsViewProps) => {\n    settingsViewCalls.push(props);\n    const navigationProps = props as SettingsViewProps & {\n      onCarouselNavigationLockChange?: (locked: boolean) => void;\n    };\n    return (`,
);
carouselTest = replaceIfPresent(
  carouselTest,
  `        <button type="button" data-home-carousel-swipe-lock="true">\n          Settings-owned swipe target\n        </button>`,
  `        <button type="button" data-home-carousel-swipe-lock="true">\n          Settings-owned swipe target\n        </button>\n        <button\n          type="button"\n          onClick={() => navigationProps.onCarouselNavigationLockChange?.(true)}\n        >\n          Open Settings editor\n        </button>\n        <button\n          type="button"\n          onClick={() => navigationProps.onCarouselNavigationLockChange?.(false)}\n        >\n          Close Settings editor\n        </button>`,
);
const lockTest = `\n  it("locks the native carousel owner while a Settings editor is open", async () => {\n    const user = userEvent.setup();\n    const { viewport } = renderCarousel();\n    await settleAt(viewport, 2);\n\n    await user.click(screen.getByRole("button", { name: "Open Settings editor" }));\n\n    expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    expect(viewport).toHaveClass("overflow-x-hidden", "[touch-action:pan-y]");\n    viewport.focus();\n    scrollToMock.mockClear();\n    fireEvent.keyDown(viewport, { key: "ArrowLeft" });\n    expect(scrollToMock).not.toHaveBeenCalled();\n\n    await user.click(screen.getByRole("button", { name: "Close Settings editor" }));\n\n    expect(viewport).toHaveAttribute("data-navigation-locked", "false");\n    expect(viewport).toHaveClass("overflow-x-auto", "[touch-action:pan-x_pan-y]");\n  });\n`;
if (!carouselTest.includes('locks the native carousel owner while a Settings editor is open')) {
  carouselTest = carouselTest.replace(
    '\n  it("passes offline state to both Analytics and Settings without resyncing", () => {',
    `${lockTest}\n  it("passes offline state to both Analytics and Settings without resyncing", () => {`,
  );
}
writeFileSync(carouselTestPath, carouselTest);

const settingsContentPath = 'src/components/SettingsViewContent.tsx';
let settingsContent = readFileSync(settingsContentPath, 'utf8');
settingsContent = replaceIfPresent(
  settingsContent,
  `  >;\n};\n\ntype ControlSectionId`,
  `  >;\n  onCarouselNavigationLockChange?: (locked: boolean) => void;\n};\n\ntype ControlSectionId`,
);
settingsContent = replaceIfPresent(
  settingsContent,
  `export function SettingsView({ onToast, analyticsSync }: SettingsViewProps) {`,
  `export function SettingsView({\n  onToast,\n  analyticsSync,\n  onCarouselNavigationLockChange,\n}: SettingsViewProps) {`,
);
settingsContent = replaceIfPresent(
  settingsContent,
  `  const [quickNoteEditor, setQuickNoteEditor] = useState<QuickNoteEditorState | null>(null);\n  const editorOriginRef`,
  `  const [quickNoteEditor, setQuickNoteEditor] = useState<QuickNoteEditorState | null>(null);\n  const hasOpenEditor = itemEditor !== null || quickNoteEditor !== null;\n  const editorOriginRef`,
);
settingsContent = replaceIfPresent(
  settingsContent,
  `  useEffect(() => setLocalAccounts(accounts), [accounts]);`,
  `  useEffect(() => {\n    onCarouselNavigationLockChange?.(hasOpenEditor);\n    return () => {\n      if (hasOpenEditor) onCarouselNavigationLockChange?.(false);\n    };\n  }, [hasOpenEditor, onCarouselNavigationLockChange]);\n\n  useEffect(() => setLocalAccounts(accounts), [accounts]);`,
);
writeFileSync(settingsContentPath, settingsContent);

const carouselPath = 'src/components/TransactionFlow/HomeDashboardCarousel.tsx';
let carousel = readFileSync(carouselPath, 'utf8');
carousel = replaceIfPresent(
  carousel,
  `  const [activeIndex, setActiveIndex] = useState(0);`,
  `  const [activeIndex, setActiveIndex] = useState(0);\n  const [navigationLocked, setNavigationLocked] = useState(false);`,
);
carousel = replaceIfPresent(
  carousel,
  `  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {\n    const viewport = viewportRef.current;`,
  `  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {\n    if (navigationLocked) return;\n    const viewport = viewportRef.current;`,
);
carousel = replaceIfPresent(
  carousel,
  `        data-motion-status="settled"\n        data-selected-snap="0"`,
  `        data-motion-status="settled"\n        data-navigation-locked={navigationLocked ? "true" : "false"}\n        data-selected-snap="0"`,
);
carousel = replaceIfPresent(
  carousel,
  `        className="h-full min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-auto scroll-smooth [scrollbar-width:none] [touch-action:pan-x_pan-y] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"`,
  `        className={\`h-full min-h-0 snap-x snap-mandatory overflow-y-hidden overscroll-x-auto scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden \${\n          navigationLocked\n            ? "overflow-x-hidden [touch-action:pan-y]"\n            : "overflow-x-auto [touch-action:pan-x_pan-y]"\n        }\`}`,
);
carousel = replaceIfPresent(
  carousel,
  `            <SettingsView onToast={onToast} analyticsSync={analyticsSync} />`,
  `            <SettingsView\n              onToast={onToast}\n              analyticsSync={analyticsSync}\n              onCarouselNavigationLockChange={setNavigationLocked}\n            />`,
);
writeFileSync(carouselPath, carousel);

const settingsTestPath = 'src/components/SettingsView.test.tsx';
let settingsTest = readFileSync(settingsTestPath, 'utf8');
settingsTest = replaceIfPresent(
  settingsTest,
  `function renderView() {\n  return render(<SettingsView onToast={mocks.onToast} analyticsSync={analyticsSync} />);\n}`,
  `function renderView(\n  props: Partial<React.ComponentProps<typeof SettingsView>> = {},\n) {\n  return render(\n    <SettingsView\n      onToast={mocks.onToast}\n      analyticsSync={analyticsSync}\n      {...props}\n    />,\n  );\n}`,
);
const settingsLockTest = `\n  it("reports carousel navigation ownership while a nested editor is open", async () => {\n    const user = userEvent.setup();\n    const onCarouselNavigationLockChange = vi.fn();\n    renderView({ onCarouselNavigationLockChange });\n\n    await user.click(screen.getByRole("button", { name: /Accounts/ }));\n    await user.click(screen.getByRole("button", { name: "Wallet" }));\n    await waitFor(() =>\n      expect(onCarouselNavigationLockChange).toHaveBeenLastCalledWith(true),\n    );\n\n    await user.click(screen.getByRole("button", { name: "Close mock item editor" }));\n    await waitFor(() =>\n      expect(onCarouselNavigationLockChange).toHaveBeenLastCalledWith(false),\n    );\n  });\n`;
if (!settingsTest.includes('reports carousel navigation ownership while a nested editor is open')) {
  settingsTest = settingsTest.replace(
    '\n  it("keeps technical sync details collapsed until Data & sync is opened", async () => {',
    `${settingsLockTest}\n  it("keeps technical sync details collapsed until Data & sync is opened", async () => {`,
  );
}
writeFileSync(settingsTestPath, settingsTest);
