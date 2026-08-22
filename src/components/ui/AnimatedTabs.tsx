import type React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { HapticSelectionButton } from "./HapticSelectionButton";

type Tab<T extends string> = {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

type AnimatedTabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  variant?: "default" | "pill" | "simple" | "compact";
  className?: string;
  disabled?: boolean;
  visualProgress?: number;
};

const springTransition = { type: "spring", stiffness: 380, damping: 30 };

export function AnimatedTabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
  variant = "default",
  className,
  disabled,
  visualProgress,
}: AnimatedTabsProps<T>) {
  if (variant === "pill") {
    return (
      <div className={cn("flex gap-2", className)}>
        {tabs.map((tab) => {
          const isSelected = tab.value === value;
          return (
            <HapticSelectionButton
              key={tab.value}
              type="button"
              changesValue={!isSelected}
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative rounded-full px-3 py-1.5 text-xs font-medium",
                disabled && "opacity-60",
              )}
              disabled={disabled}
            >
              {isSelected ? (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={springTransition}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10",
                  isSelected
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {tab.label}
              </span>
            </HapticSelectionButton>
          );
        })}
      </div>
    );
  }

  if (variant === "compact") {
    const selectedIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.value === value),
    );
    const progress = Math.max(
      0,
      Math.min(tabs.length - 1, visualProgress ?? selectedIndex),
    );
    const visualIndex = Math.round(progress);

    return (
      <div
        data-testid="animated-tabs-compact"
        data-animated-tabs-variant="compact"
        className={cn(
          "relative grid h-[52px] gap-1 rounded-2xl border border-border bg-surface-2 p-1",
          className,
        )}
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        <motion.div
          data-testid="animated-tabs-compact-indicator"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-xl bg-surface-3"
          style={{
            width: `calc((100% - ${8 + (tabs.length - 1) * 4}px) / ${tabs.length})`,
            transform: `translateX(calc(${progress * 100}% + ${progress * 4}px))`,
          }}
        />
        {tabs.map((tab, index) => {
          const isSelected = tab.value === value;
          const isVisuallySelected = index === visualIndex;
          const Icon = tab.icon;
          return (
            <HapticSelectionButton
              key={tab.value}
              type="button"
              aria-pressed={isSelected}
              changesValue={!isSelected}
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                disabled && "opacity-60",
              )}
              disabled={disabled}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "relative z-10 h-4 w-4",
                    isVisuallySelected
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10",
                  isVisuallySelected
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {tab.label}
              </span>
            </HapticSelectionButton>
          );
        })}
      </div>
    );
  }

  if (variant === "simple") {
    return (
      <div className={cn("flex rounded-xl bg-surface-2 p-1", className)}>
        {tabs.map((tab) => {
          const isSelected = tab.value === value;
          return (
            <HapticSelectionButton
              key={tab.value}
              type="button"
              changesValue={!isSelected}
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative flex-1 rounded-lg py-2 text-sm font-medium",
                disabled && "opacity-60",
              )}
              disabled={disabled}
            >
              {isSelected ? (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-lg bg-card shadow-sm"
                  transition={springTransition}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10",
                  isSelected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {tab.label}
              </span>
            </HapticSelectionButton>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-2 rounded-3xl border border-border/70 bg-surface-2/80 p-2",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const isSelected = tab.value === value;
        const Icon = tab.icon;
        return (
          <HapticSelectionButton
            key={tab.value}
            type="button"
            changesValue={!isSelected}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-3 text-xs font-semibold",
              disabled && "opacity-60",
            )}
            disabled={disabled}
          >
            {isSelected ? (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-2xl bg-card"
                transition={springTransition}
              />
            ) : null}
            {Icon ? (
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-xl",
                  isSelected
                    ? "bg-accent text-primary"
                    : "bg-card/70 text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <span
              className={cn(
                "relative z-10",
                isSelected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {tab.label}
            </span>
          </HapticSelectionButton>
        );
      })}
    </div>
  );
}
