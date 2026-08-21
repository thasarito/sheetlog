import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";
import { cn } from "../../lib/utils";

type ToasterProps = ComponentProps<typeof Sonner>;

const DESKTOP_SAFE_TOP_OFFSET =
  "calc(env(safe-area-inset-top, 0px) + 24px)";
const MOBILE_SAFE_TOP_OFFSET =
  "calc(env(safe-area-inset-top, 0px) + 16px)";
const SAFE_BOTTOM_OFFSET =
  "calc(env(safe-area-inset-bottom, 0px) + 16px)";
const DEFAULT_TOAST_OFFSET = {
  top: DESKTOP_SAFE_TOP_OFFSET,
};
const DEFAULT_MOBILE_TOAST_OFFSET = {
  top: MOBILE_SAFE_TOP_OFFSET,
  right: 16,
  bottom: SAFE_BOTTOM_OFFSET,
  left: 16,
};

export function Toaster({
  className,
  toastOptions,
  offset,
  mobileOffset,
  ...props
}: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      offset={offset ?? DEFAULT_TOAST_OFFSET}
      mobileOffset={mobileOffset ?? DEFAULT_MOBILE_TOAST_OFFSET}
      className={cn("toaster group", className)}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
        ...toastOptions,
      }}
      {...props}
    />
  );
}
