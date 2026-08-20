import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Could not find ${label}`);
  }
  return source.replace(before, after);
}

const carouselPath = 'src/components/TransactionFlow/HomeDashboardCarousel.tsx';
let carousel = readFileSync(carouselPath, 'utf8');

carousel = replaceOnce(
  carousel,
  `  );\n\n  const settleHorizontalScroll = useCallback(() => {`,
  `  );\n\n  const restoreLockedPosition = useCallback(() => {\n    if (!navigationLocked) return false;\n    const viewport = viewportRef.current;\n    if (!viewport || viewport.clientWidth <= 0) return true;\n\n    clearSettleTimer();\n    touchActiveRef.current = false;\n    const index = activeIndexRef.current;\n    const targetLeft = index * viewport.clientWidth;\n    if (Math.abs(viewport.scrollLeft - targetLeft) > SNAP_TOLERANCE_PX) {\n      viewport.scrollTo({ left: targetLeft, behavior: "auto" });\n    }\n    renderHorizontalPosition(false);\n    commitActiveIndex(index);\n    return true;\n  }, [\n    clearSettleTimer,\n    commitActiveIndex,\n    navigationLocked,\n    renderHorizontalPosition,\n  ]);\n\n  const settleHorizontalScroll = useCallback(() => {`,
  'locked-position restore callback',
);

carousel = replaceOnce(
  carousel,
  `  const settleHorizontalScroll = useCallback(() => {\n    const viewport = viewportRef.current;\n    if (!viewport || viewport.clientWidth <= 0) return;\n    clearSettleTimer();`,
  `  const settleHorizontalScroll = useCallback(() => {\n    const viewport = viewportRef.current;\n    if (!viewport || viewport.clientWidth <= 0) return;\n    if (restoreLockedPosition()) return;\n    clearSettleTimer();`,
  'locked settle guard',
);

carousel = replaceOnce(
  carousel,
  `    renderHorizontalPosition,\n    scheduleHorizontalSettle,\n  ]);`,
  `    renderHorizontalPosition,\n    restoreLockedPosition,\n    scheduleHorizontalSettle,\n  ]);`,
  'settle callback dependencies',
);

carousel = replaceOnce(
  carousel,
  `  useLayoutEffect(() => {\n    settleHorizontalScrollRef.current = settleHorizontalScroll;\n  }, [settleHorizontalScroll]);\n\n  useEffect(() => {`,
  `  useLayoutEffect(() => {\n    settleHorizontalScrollRef.current = settleHorizontalScroll;\n  }, [settleHorizontalScroll]);\n\n  useLayoutEffect(() => {\n    if (navigationLocked) restoreLockedPosition();\n  }, [navigationLocked, restoreLockedPosition]);\n\n  useEffect(() => {`,
  'lock activation alignment effect',
);

carousel = replaceOnce(
  carousel,
  `  const handleViewportScroll = () => {\n    renderHorizontalPosition(true);`,
  `  const handleViewportScroll = () => {\n    if (restoreLockedPosition()) return;\n    renderHorizontalPosition(true);`,
  'locked scroll rejection',
);

carousel = replaceOnce(
  carousel,
  `  const handleTouchStart = () => {\n    touchActiveRef.current = true;`,
  `  const handleTouchStart = () => {\n    if (restoreLockedPosition()) return;\n    touchActiveRef.current = true;`,
  'locked touch-start rejection',
);

carousel = replaceOnce(
  carousel,
  `  const releaseTouch = () => {\n    touchActiveRef.current = false;`,
  `  const releaseTouch = () => {\n    if (restoreLockedPosition()) return;\n    touchActiveRef.current = false;`,
  'locked touch-release rejection',
);

writeFileSync(carouselPath, carousel);

const settingsPath = 'src/components/SettingsViewContent.tsx';
let settings = readFileSync(settingsPath, 'utf8');

settings = replaceOnce(
  settings,
  `  const [quickNoteEditor, setQuickNoteEditor] = useState<QuickNoteEditorState | null>(null);\n  const hasOpenEditor = itemEditor !== null || quickNoteEditor !== null;\n  const editorOriginRef`,
  `  const [quickNoteEditor, setQuickNoteEditor] = useState<QuickNoteEditorState | null>(null);\n  const editorOriginRef`,
  'derived editor-open state removal',
);

settings = replaceOnce(
  settings,
  `  useEffect(() => {\n    onCarouselNavigationLockChange?.(hasOpenEditor);\n    return () => {\n      if (hasOpenEditor) onCarouselNavigationLockChange?.(false);\n    };\n  }, [hasOpenEditor, onCarouselNavigationLockChange]);`,
  `  useEffect(\n    () => () => {\n      onCarouselNavigationLockChange?.(false);\n    },\n    [onCarouselNavigationLockChange],\n  );`,
  'editor lock effect replacement',
);

settings = replaceOnce(
  settings,
  `  const dismissItemEditor = useCallback(() => {\n    setItemEditor(null);\n    restoreEditorFocus();\n  }, [restoreEditorFocus]);`,
  `  const dismissItemEditor = useCallback(() => {\n    setItemEditor(null);\n    onCarouselNavigationLockChange?.(false);\n    restoreEditorFocus();\n  }, [onCarouselNavigationLockChange, restoreEditorFocus]);`,
  'item editor synchronous unlock',
);

settings = replaceOnce(
  settings,
  `  const dismissQuickNoteEditor = useCallback(() => {\n    setQuickNoteEditor(null);\n    restoreEditorFocus();\n  }, [restoreEditorFocus]);`,
  `  const dismissQuickNoteEditor = useCallback(() => {\n    setQuickNoteEditor(null);\n    onCarouselNavigationLockChange?.(false);\n    restoreEditorFocus();\n  }, [onCarouselNavigationLockChange, restoreEditorFocus]);`,
  'Quick Note editor synchronous unlock',
);

settings = replaceOnce(
  settings,
  `  const openItemEditor = (target: SettingsItemEditorTarget, origin: HTMLElement) => {\n    editorOriginRef.current = origin;`,
  `  const openItemEditor = (target: SettingsItemEditorTarget, origin: HTMLElement) => {\n    onCarouselNavigationLockChange?.(true);\n    editorOriginRef.current = origin;`,
  'item editor synchronous lock',
);

settings = replaceOnce(
  settings,
  `  ) => {\n    editorOriginRef.current = origin;\n    setQuickNoteEditor({`,
  `  ) => {\n    onCarouselNavigationLockChange?.(true);\n    editorOriginRef.current = origin;\n    setQuickNoteEditor({`,
  'Quick Note editor synchronous lock',
);

settings = replaceOnce(
  settings,
  `      <div\n        data-testid="settings-control-center-scroll"\n        data-dashboard-scroll="true"\n        className="h-full overflow-y-auto overscroll-contain pb-safe"\n      >\n        <div className="space-y-4 px-4 pb-8 pt-3">`,
  `      <div\n        data-testid="settings-control-center-scroll"\n        data-dashboard-scroll="true"\n        className="h-full overflow-y-auto overscroll-contain pb-safe"\n        style={{\n          scrollPaddingBottom:\n            'calc(var(--category-sheet-occlusion, 44px) + 1rem)',\n        }}\n      >\n        <div\n          className="space-y-4 px-4 pt-3"\n          style={{\n            paddingBottom:\n              'calc(var(--category-sheet-occlusion, 44px) + 2rem)',\n          }}\n        >`,
  'transaction-entry occlusion spacing',
);

writeFileSync(settingsPath, settings);
