import type React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

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
  variant?: "default" | "pill" | "simple";
  className?: string;
  disabled?: boolean;
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
}: AnimatedTabsProps<T>) {
  if (variant === "pill") {
    return (
      <div className={cn("flex gap-2", className)}>
        {tabs.map((tab) => {
          const isSelected = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative rounded-full px-3 py-1.5 text-xs font-medium",
                disabled && "opacity-60"
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
                  isSelected ? "text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
            </button>
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
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative flex-1 rounded-lg py-2 text-sm font-medium",
                disabled && "opacity-60"
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
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-2 rounded-3xl border border-border/70 bg-surface-2/80 p-2",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const isSelected = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-3 text-xs font-semibold",
              disabled && "opacity-60"
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
                    : "bg-card/70 text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <span
              className={cn(
                "relative z-10",
                isSelected ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
