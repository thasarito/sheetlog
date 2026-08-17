import {
  forwardRef,
  useRef,
  type ButtonHTMLAttributes,
  type PointerEvent,
} from 'react';
import { cn } from '../../lib/utils';

const HORIZONTAL_DRAG_THRESHOLD = 8;

export const CarouselActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function CarouselActionButton(
  {
    className,
    onClick,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    ...props
  },
  ref,
) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const finishPointer = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerStart.current = null;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  return (
    <button
      {...props}
      ref={ref}
      className={cn('[touch-action:pan-y]', className)}
      onPointerDown={(event) => {
        event.stopPropagation();
        pointerStart.current = { x: event.clientX, y: event.clientY };
        suppressClick.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onPointerDown?.(event);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        const start = pointerStart.current;
        if (start) {
          const x = Math.abs(event.clientX - start.x);
          const y = Math.abs(event.clientY - start.y);
          if (x > HORIZONTAL_DRAG_THRESHOLD && x > y) suppressClick.current = true;
        }
        onPointerMove?.(event);
      }}
      onPointerUp={(event) => {
        finishPointer(event);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        finishPointer(event);
        onPointerCancel?.(event);
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
          return;
        }
        onClick?.(event);
      }}
    />
  );
});
