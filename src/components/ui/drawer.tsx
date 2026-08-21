import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "../../lib/utils";

type DrawerRootProps = React.ComponentProps<typeof DrawerPrimitive.Root>;

const SAFE_AREA_CAPTURE_FRAMES = 600;

function useStableStandaloneSafeArea(open: boolean | undefined) {
  React.useEffect(() => {
    if (open || typeof window === "undefined") return;

    const navigatorWithStandalone = window.navigator as Navigator & {
      standalone?: boolean;
    };
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;

    if (!isStandalone) return;

    let animationFrame = 0;
    let attempts = 0;
    const captureSafeArea = () => {
      // iOS can temporarily report a zero top inset after modal scroll locking.
      // Capture the stable closed-state value so opening a drawer cannot move the app.
      const paddingTop = window.getComputedStyle(document.body).paddingTop;
      if (Number.parseFloat(paddingTop) > 0) {
        document.body.style.paddingTop = paddingTop;
        return;
      }
      attempts += 1;
      if (attempts < SAFE_AREA_CAPTURE_FRAMES) {
        animationFrame = window.requestAnimationFrame(captureSafeArea);
      }
    };

    captureSafeArea();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [open]);
}

const Drawer = (props: DrawerRootProps) => {
  useStableStandaloneSafeArea(props.open ?? props.defaultOpen);
  return <DrawerPrimitive.Root {...props} />;
};

const DrawerNestedRoot = (props: DrawerRootProps) => {
  useStableStandaloneSafeArea(props.open ?? props.defaultOpen);
  return <DrawerPrimitive.NestedRoot {...props} />;
};
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

type DrawerOverlayProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Overlay
> & {
  contained?: boolean;
};

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  DrawerOverlayProps
>(({ className, contained, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      contained ? "absolute inset-0 z-50" : "fixed inset-0 z-50",
      "bg-overlay/40 backdrop-blur-[2px]",
      className
    )}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

type DrawerContentProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Content
> & {
  contained?: boolean;
  showHandle?: boolean;
};

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(({ className, children, contained, showHandle = true, ...props }, ref) => {
  // When contained inside iPhone frame, the drawer is portaled to the screen element
  // which is positioned absolutely within the frame. The drawer should fill the full
  // width of the container without any transform scaling.
  return (
    <DrawerPortal>
      <DrawerOverlay contained={contained} />
      {!contained ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-[max(env(safe-area-inset-bottom),34px)] bg-card"
          data-drawer-system-area-fill
        />
      ) : null}
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          contained
            ? "absolute inset-x-0 bottom-0 z-50"
            : "fixed inset-x-0 bottom-0 z-50",
          "mt-24 flex h-auto flex-col rounded-t-[28px] border border-border bg-card",
          className
        )}
        {...props}
      >
        {showHandle ? (
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" />
        ) : null}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = DrawerPrimitive.Content.displayName;

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "grid gap-1.5 px-4 pb-2 pt-4 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 px-4 pb-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerNestedRoot,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
