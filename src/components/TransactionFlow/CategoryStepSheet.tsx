import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../ui/drawer";
import {
  CategoryStepSheetAccessoryProvider,
  DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT,
  TRANSACTION_HISTORY_DOCK_GAP,
} from "./CategoryStepSheetAccessory";

const DEFAULT_LAUNCHER_HEIGHT = 44;
const DEFAULT_EXPANDED_HEIGHT = 520;
const MIN_LAUNCHER_HEIGHT = 44;

type CategoryStepSheetProps = {
  children: React.ReactNode;
  entry: React.ReactNode;
  typeTabsHostRef?: React.Ref<HTMLFieldSetElement>;
};

function positiveHeight(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function CategoryStepSheet({
  children,
  entry,
  typeTabsHostRef,
}: CategoryStepSheetProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const [launcherElement, setLauncherElement] =
    useState<HTMLDivElement | null>(null);
  const [safeAreaElement, setSafeAreaElement] =
    useState<HTMLDivElement | null>(null);
  const [entryElement, setEntryElement] = useState<HTMLDivElement | null>(null);
  const [accessoryHost, setAccessoryHost] = useState<HTMLDivElement | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [heights, setHeights] = useState({
    collapsed: DEFAULT_LAUNCHER_HEIGHT,
    expanded: DEFAULT_EXPANDED_HEIGHT,
  });

  useLayoutEffect(() => {
    const measure = () => {
      const layoutHeight = Math.floor(
        positiveHeight(
          layoutRef.current?.getBoundingClientRect().height ?? 0,
          window.innerHeight,
        ),
      );
      const collapsedHeight = Math.max(
        MIN_LAUNCHER_HEIGHT,
        Math.ceil(
          positiveHeight(
            launcherElement?.getBoundingClientRect().height ?? 0,
            DEFAULT_LAUNCHER_HEIGHT,
          ),
        ),
      );
      const measuredSafeAreaHeight =
        safeAreaElement?.getBoundingClientRect().height ?? 0;
      const safeAreaHeight =
        Number.isFinite(measuredSafeAreaHeight) && measuredSafeAreaHeight > 0
          ? Math.ceil(measuredSafeAreaHeight)
          : 0;
      const entryContent = entryElement?.firstElementChild as
        | HTMLElement
        | undefined;
      const entryHeight = Math.ceil(
        positiveHeight(
          entryContent?.scrollHeight ?? entryElement?.scrollHeight ?? 0,
          Math.max(1, DEFAULT_EXPANDED_HEIGHT - collapsedHeight),
        ),
      );
      const collapsedContentHeight = collapsedHeight + safeAreaHeight;
      const contentHeight = collapsedContentHeight + entryHeight;

      const nextHeights = {
        collapsed: collapsedContentHeight,
        expanded: Math.max(
          collapsedContentHeight + 1,
          Math.min(contentHeight, layoutHeight),
        ),
      };
      setHeights((current) =>
        current.collapsed === nextHeights.collapsed &&
        current.expanded === nextHeights.expanded
          ? current
          : nextHeights,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (layoutRef.current) observer.observe(layoutRef.current);
    if (launcherElement) observer.observe(launcherElement);
    if (safeAreaElement) observer.observe(safeAreaElement);
    if (entryElement) observer.observe(entryElement);
    if (entryElement?.firstElementChild) {
      observer.observe(entryElement.firstElementChild);
    }
    return () => observer.disconnect();
  }, [entryElement, launcherElement, safeAreaElement]);

  const collapsedPoint = `${heights.collapsed}px`;
  const expandedPoint = `${heights.expanded}px`;
  const activePoint = collapsed ? collapsedPoint : expandedPoint;

  const reportAccessoryHeight = useCallback((height: number) => {
    const value =
      Number.isFinite(height) && height > 0
        ? Math.ceil(height)
        : DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT;
    layoutRef.current?.style.setProperty(
      "--transaction-history-dock-height",
      `${value}px`,
    );
  }, []);
  const accessoryContext = useMemo(
    () => ({
      provided: true,
      host: accessoryHost,
      reportHeight: reportAccessoryHeight,
    }),
    [accessoryHost, reportAccessoryHeight],
  );

  useEffect(() => {
    if (entryElement) entryElement.inert = collapsed;
  }, [collapsed, entryElement]);

  return (
    <CategoryStepSheetAccessoryProvider value={accessoryContext}>
      <div
        ref={layoutRef}
        data-testid="category-step-layout"
        className="relative h-full min-h-0"
        style={
          {
            "--category-sheet-occlusion": activePoint,
            "--transaction-history-dock-height": `${DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
        <div className="h-full min-h-0">{children}</div>
        <Drawer
        open
        modal={false}
        dismissible={false}
        shouldScaleBackground={false}
        noBodyStyles
        disablePreventScroll
        snapPoints={[collapsedPoint, expandedPoint]}
        activeSnapPoint={activePoint}
        setActiveSnapPoint={(point) => {
          if (point === collapsedPoint) setCollapsed(true);
          if (point === expandedPoint) setCollapsed(false);
        }}
        >
          <DrawerContent
            showHandle={false}
            onClick={() => {
              if (collapsed) setCollapsed(false);
            }}
            className="overflow-visible motion-reduce:![transition:none] sm:mx-auto sm:max-w-md"
            style={
              {
                height: "100dvh",
                "--category-sheet-safe-area": "env(safe-area-inset-bottom)",
              } as React.CSSProperties
            }
          >
            <DrawerTitle className="sr-only">Transaction entry</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose a transaction category or collapse the entry sheet to
              review transactions and analytics.
            </DrawerDescription>
            <div
              ref={setAccessoryHost}
              data-testid="category-step-accessory-host"
              data-vaul-no-drag
              className="pointer-events-none absolute -top-px inset-x-0 z-10 overflow-visible"
              style={{
                transform: `translateY(calc(-100% - ${TRANSACTION_HISTORY_DOCK_GAP}px))`,
              }}
            />
            <div
              ref={sheetBodyRef}
              data-testid="category-step-sheet-body"
              className="flex min-h-0 flex-col overflow-hidden"
              style={{ height: expandedPoint }}
            >
              <div
                ref={setLauncherElement}
                data-testid="category-step-launcher"
                className="order-1 shrink-0"
              >
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  aria-label={
                    collapsed
                      ? "Expand transaction entry"
                      : "Collapse transaction entry"
                  }
                  onClick={() => setCollapsed(!collapsed)}
                  className="flex min-h-11 w-full items-center justify-center px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                >
                  <span
                    className="h-1 w-8 rounded-full bg-border"
                    aria-hidden="true"
                  />
                </button>
                {typeTabsHostRef ? (
                  <fieldset
                    ref={typeTabsHostRef}
                    aria-label="Transaction type"
                    data-testid="category-step-type-tabs"
                    data-vaul-no-drag
                    className="m-0 min-w-0 border-0 p-0 pb-3"
                  />
                ) : null}
              </div>
              <div
                ref={setEntryElement}
                aria-hidden={collapsed}
                data-testid="category-step-entry"
                data-vaul-no-drag
                className={`${collapsed ? "order-3 opacity-0" : "order-2 opacity-100"} min-h-0 flex-1 overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none`}
                style={{
                  transform: collapsed
                    ? "translateY(calc(-1 * var(--category-sheet-safe-area)))"
                    : "translateY(0)",
                }}
              >
                {entry}
              </div>
              <div
                ref={setSafeAreaElement}
                aria-hidden="true"
                data-testid="category-step-safe-area"
                className={`${collapsed ? "order-2" : "order-3"} shrink-0`}
                style={{ height: "var(--category-sheet-safe-area)" }}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </CategoryStepSheetAccessoryProvider>
  );
}
