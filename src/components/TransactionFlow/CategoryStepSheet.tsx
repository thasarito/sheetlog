import type React from "react";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";
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
import { useKeyboardViewportState } from "./useKeyboardViewportState";

const DEFAULT_LAUNCHER_HEIGHT = 44;
const DEFAULT_EXPANDED_HEIGHT = 520;
const DEFAULT_KEYBOARD_HEIGHT = 300;
const MIN_LAUNCHER_HEIGHT = 44;

type CategoryStepSheetState = "collapsed" | "expanded" | "keyboard";
type RestorableCategoryStepSheetState = Exclude<
  CategoryStepSheetState,
  "keyboard"
>;

type CategoryStepSheetProps = {
  children: React.ReactNode;
  entry: React.ReactNode;
  layoutHeight: number;
  typeTabsHostRef?: React.Ref<HTMLFieldSetElement>;
};

function positiveHeight(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function uniqueSortedSnapPoints(heights: number[]): string[] {
  return [...new Set(heights)]
    .sort((left, right) => left - right)
    .map((height) => `${height}px`);
}

export function CategoryStepSheet({
  children,
  entry,
  layoutHeight,
  typeTabsHostRef,
}: CategoryStepSheetProps) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const [layoutElement, setLayoutElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [launcherElement, setLauncherElement] =
    useState<HTMLDivElement | null>(null);
  const [safeAreaElement, setSafeAreaElement] =
    useState<HTMLDivElement | null>(null);
  const [entryElement, setEntryElement] = useState<HTMLDivElement | null>(null);
  const [accessoryHost, setAccessoryHost] = useState<HTMLDivElement | null>(
    null,
  );
  const [sheetState, setSheetStateValue] =
    useState<CategoryStepSheetState>("expanded");
  const sheetStateRef = useRef<CategoryStepSheetState>("expanded");
  const previousSheetStateRef =
    useRef<RestorableCategoryStepSheetState>("expanded");
  const keyboardWasActiveRef = useRef(false);
  const [rememberedKeyboardHeight, setRememberedKeyboardHeight] = useState(
    DEFAULT_KEYBOARD_HEIGHT,
  );
  const [heights, setHeights] = useState({
    collapsed: DEFAULT_LAUNCHER_HEIGHT,
    expanded: DEFAULT_EXPANDED_HEIGHT,
  });
  const keyboardViewport = useKeyboardViewportState(layoutHeight);

  const setSheetState = useCallback((nextState: CategoryStepSheetState) => {
    sheetStateRef.current = nextState;
    setSheetStateValue(nextState);
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const measuredLayoutHeight = Math.floor(
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
          Math.min(contentHeight, measuredLayoutHeight),
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

  useLayoutEffect(() => {
    if (keyboardViewport.active) {
      keyboardWasActiveRef.current = true;
      setRememberedKeyboardHeight(keyboardViewport.height);
      return;
    }

    if (!keyboardWasActiveRef.current) return;
    keyboardWasActiveRef.current = false;
    if (sheetStateRef.current === "keyboard") {
      setSheetState(previousSheetStateRef.current);
    }
  }, [keyboardViewport.active, keyboardViewport.height, setSheetState]);

  const maximumKeyboardHeight = Math.max(
    heights.collapsed + 1,
    Math.floor(positiveHeight(layoutHeight, DEFAULT_EXPANDED_HEIGHT)),
  );
  const rawKeyboardHeight = keyboardViewport.active
    ? keyboardViewport.height
    : rememberedKeyboardHeight;
  const keyboardHeight = Math.min(
    maximumKeyboardHeight,
    Math.max(heights.collapsed + 1, Math.round(rawKeyboardHeight)),
  );
  const collapsedPoint = `${heights.collapsed}px`;
  const expandedPoint = `${heights.expanded}px`;
  const keyboardPoint = `${keyboardHeight}px`;
  const snapPoints = useMemo(
    () =>
      uniqueSortedSnapPoints(
        sheetState === "keyboard"
          ? [heights.collapsed, keyboardHeight, heights.expanded]
          : [heights.collapsed, heights.expanded],
      ),
    [heights.collapsed, heights.expanded, keyboardHeight, sheetState],
  );
  const activePoint =
    sheetState === "collapsed"
      ? collapsedPoint
      : sheetState === "keyboard"
        ? keyboardPoint
        : expandedPoint;
  const collapsed = sheetState === "collapsed";
  const entryVisible = sheetState === "expanded";
  const keyboardState = sheetState === "keyboard";

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
  const setLayoutHost = useCallback((element: HTMLDivElement | null) => {
    layoutRef.current = element;
    setLayoutElement(element);
  }, []);
  const requestExpanded = useCallback(
    () => setSheetState("expanded"),
    [setSheetState],
  );
  const requestKeyboard = useCallback(() => {
    const currentState = sheetStateRef.current;
    if (currentState === "keyboard") return;
    previousSheetStateRef.current = currentState;
    setSheetState("keyboard");
  }, [setSheetState]);
  const releaseKeyboard = useCallback(() => {
    if (!keyboardViewport.active && sheetStateRef.current === "keyboard") {
      setSheetState(previousSheetStateRef.current);
    }
  }, [keyboardViewport.active, setSheetState]);
  const accessoryContext = useMemo(
    () => ({
      provided: true,
      host: accessoryHost,
      reportHeight: reportAccessoryHeight,
      requestExpanded,
      requestKeyboard,
      releaseKeyboard,
    }),
    [
      accessoryHost,
      releaseKeyboard,
      reportAccessoryHeight,
      requestExpanded,
      requestKeyboard,
    ],
  );

  useLayoutEffect(() => {
    if (entryElement) entryElement.inert = !entryVisible;
    if (sheetBodyRef.current) sheetBodyRef.current.inert = keyboardState;
  }, [entryElement, entryVisible, keyboardState]);

  return (
    <CategoryStepSheetAccessoryProvider value={accessoryContext}>
      <div
        ref={setLayoutHost}
        data-testid="category-step-layout"
        data-category-sheet-state={sheetState}
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
          container={layoutElement}
          open
          modal={false}
          dismissible={false}
          shouldScaleBackground={false}
          noBodyStyles
          disablePreventScroll
          repositionInputs={false}
          snapPoints={snapPoints}
          activeSnapPoint={activePoint}
          setActiveSnapPoint={(point) => {
            if (
              sheetStateRef.current === "keyboard" &&
              point === keyboardPoint
            ) {
              return;
            }
            if (point === collapsedPoint) {
              setSheetState("collapsed");
              return;
            }
            if (point === expandedPoint) {
              setSheetState("expanded");
              return;
            }
            if (point === keyboardPoint) setSheetState("keyboard");
          }}
        >
          <DrawerContent
            contained
            showHandle={false}
            data-category-sheet-state={sheetState}
            onClick={() => {
              if (collapsed) setSheetState("expanded");
            }}
            className={cn(
              "overflow-visible motion-reduce:![transition:none] sm:mx-auto sm:max-w-md",
              keyboardState && "![transition:none]",
            )}
            style={
              {
                height: `${layoutHeight}px`,
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
              data-category-sheet-state={sheetState}
              data-keyboard-active={keyboardViewport.active}
              data-keyboard-height={keyboardViewport.height}
              data-keyboard-top={keyboardViewport.top}
              data-vaul-no-drag
              className="pointer-events-none absolute -top-px inset-x-0 z-10 overflow-visible"
              style={{
                transform: `translateY(calc(-100% - ${TRANSACTION_HISTORY_DOCK_GAP}px + var(--transaction-history-keyboard-offset, 0px)))`,
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
                  onClick={() =>
                    setSheetState(collapsed ? "expanded" : "collapsed")
                  }
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
                aria-hidden={!entryVisible}
                data-testid="category-step-entry"
                data-vaul-no-drag
                className={`${collapsed ? "order-3" : "order-2"} min-h-0 flex-1 overflow-y-auto`}
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
