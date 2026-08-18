import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../ui/drawer";

const DEFAULT_LAUNCHER_HEIGHT = 64;
const DEFAULT_EXPANDED_HEIGHT = 520;
const MIN_LAUNCHER_HEIGHT = 44;

type CategoryStepSheetProps = {
  children: React.ReactNode;
  entry: React.ReactNode;
};

function positiveHeight(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function CategoryStepSheet({
  children,
  entry,
}: CategoryStepSheetProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const entryRef = useRef<HTMLDivElement>(null);
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
            launcherRef.current?.getBoundingClientRect().height ?? 0,
            DEFAULT_LAUNCHER_HEIGHT,
          ),
        ),
      );
      const contentHeight = Math.ceil(
        positiveHeight(
          sheetBodyRef.current?.scrollHeight ?? 0,
          DEFAULT_EXPANDED_HEIGHT,
        ),
      );

      setHeights({
        collapsed: collapsedHeight,
        expanded: Math.max(
          collapsedHeight + 1,
          Math.min(contentHeight, layoutHeight),
        ),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (layoutRef.current) observer.observe(layoutRef.current);
    if (sheetBodyRef.current) observer.observe(sheetBodyRef.current);
    return () => observer.disconnect();
  }, []);

  const collapsedPoint = `${heights.collapsed}px`;
  const expandedPoint = `${heights.expanded}px`;
  const activePoint = collapsed ? collapsedPoint : expandedPoint;

  useEffect(() => {
    if (entryRef.current) entryRef.current.inert = collapsed;
  }, [collapsed]);

  return (
    <div
      ref={layoutRef}
      data-testid="category-step-layout"
      className="relative h-full min-h-0"
      style={
        {
          "--category-sheet-occlusion": activePoint,
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
          className="overflow-hidden sm:mx-auto sm:max-w-md"
          style={{ height: "100dvh" }}
        >
          <DrawerTitle className="sr-only">Transaction entry</DrawerTitle>
          <DrawerDescription className="sr-only">
            Choose a transaction category or collapse the entry sheet to review
            transactions and analytics.
          </DrawerDescription>
          <div
            ref={sheetBodyRef}
            data-testid="category-step-sheet-body"
            className="flex min-h-0 flex-col"
          >
            <div
              ref={launcherRef}
              data-testid="category-step-launcher"
              className="pb-safe"
            >
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={
                  collapsed
                    ? "Expand transaction entry"
                    : "Collapse transaction entry"
                }
                onClick={() => setCollapsed((value) => !value)}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
              >
                <span
                  className="h-1.5 w-12 rounded-full bg-border"
                  aria-hidden="true"
                />
                {collapsed ? (
                  <span className="text-sm font-semibold text-foreground">
                    Log transaction
                  </span>
                ) : null}
              </button>
            </div>
            <div
              ref={entryRef}
              aria-hidden={collapsed}
              data-vaul-no-drag
              className="min-h-0 overflow-y-auto"
            >
              {entry}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
