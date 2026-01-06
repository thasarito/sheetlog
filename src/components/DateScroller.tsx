import { addDays, addMonths, format, isSameDay, subMonths } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';

interface DateScrollerProps {
  value: Date;
  onChange: (date: Date) => void;
}

export function DateScroller({ value, onChange }: DateScrollerProps) {
  const today = new Date();
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(value, i - 3)),
    [value],
  );
  const weekKey = format(weekDates[0], 'yyyy-MM-dd');
  const previousValueRef = useRef(value);
  const valueTime = value.getTime();
  const previousValueTime = previousValueRef.current.getTime();
  const direction = valueTime === previousValueTime ? 0 : valueTime > previousValueTime ? 1 : -1;
  const isTodaySelected = isSameDay(value, today);

  useEffect(() => {
    previousValueRef.current = value;
  }, [value]);

  const handleMonthChange = (direction: number) => {
    const newDate = direction > 0 ? addMonths(value, 1) : subMonths(value, 1);
    onChange(newDate);
  };

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number } },
  ) => {
    const swipeThreshold = 60;
    if (info.offset.x < -swipeThreshold) {
      onChange(addDays(value, 7));
      return;
    }
    if (info.offset.x > swipeThreshold) {
      onChange(addDays(value, -7));
    }
  };

  const handleToday = () => {
    if (isTodaySelected) return;
    const nextDate = new Date(value);
    nextDate.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    onChange(nextDate);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onChange(addDays(value, -1));
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onChange(addDays(value, 1));
    }
  };

  const weekVariants = {
    enter: (directionValue: number) => ({
      x: directionValue === 0 ? 0 : directionValue > 0 ? 36 : -36,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (directionValue: number) => ({
      x: directionValue === 0 ? 0 : directionValue > 0 ? -36 : 36,
      opacity: 0,
    }),
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <motion.button
          type="button"
          onClick={() => handleMonthChange(-1)}
          aria-label="Previous month"
          className="cursor-pointer rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          whileTap={{ scale: 0.95 }}
        >
          ←
        </motion.button>
        <div className="flex items-center justify-center gap-2">
          <div className="text-sm font-semibold text-foreground" aria-live="polite">
            {format(value, 'MMMM yyyy')}
          </div>
          <motion.button
            type="button"
            onClick={handleToday}
            disabled={isTodaySelected}
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isTodaySelected
                ? 'border-border text-muted-foreground'
                : 'border-primary/30 text-primary hover:border-primary/50'
            }`}
            whileTap={{ scale: 0.96 }}
          >
            Today
          </motion.button>
        </div>
        <motion.button
          type="button"
          onClick={() => handleMonthChange(1)}
          aria-label="Next month"
          className="cursor-pointer rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          whileTap={{ scale: 0.95 }}
        >
          →
        </motion.button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-card p-1" onKeyDown={handleKeyDown}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={weekKey}
            custom={direction}
            variants={weekVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="grid grid-cols-7 gap-2 cursor-grab select-none active:cursor-grabbing"
            style={{ touchAction: 'pan-y' }}
            role="list"
            aria-label="Select date"
          >
            {weekDates.map((date) => {
              const isSelected = isSameDay(date, value);
              const isToday = isSameDay(date, today);
              const dateKey = format(date, 'yyyy-MM-dd');

              return (
                <motion.button
                  key={dateKey}
                  type="button"
                  onClick={() => onChange(date)}
                  className={`relative flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer ${
                    isSelected
                      ? 'border-primary/60 text-primary-foreground'
                      : 'bg-card border-border text-muted-foreground hover:border-border/70'
                  }`}
                  whileTap={{ scale: 0.96 }}
                  aria-pressed={isSelected}
                  aria-label={format(date, 'EEEE, MMMM d')}
                  aria-current={isToday ? 'date' : undefined}
                >
                  {isSelected ? (
                    <motion.div
                      layoutId="activeDate"
                      className="absolute inset-0 rounded-xl bg-primary"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  ) : null}
                  <span className="relative z-10 text-[10px] uppercase tracking-wide opacity-70">
                    {format(date, 'EEE')}
                  </span>
                  <span className="relative z-10 text-sm font-semibold">{format(date, 'd')}</span>
                  <span
                    className={`relative z-10 mt-1 h-1 w-1 rounded-full ${
                      isToday
                        ? isSelected
                          ? 'bg-primary-foreground'
                          : 'bg-primary'
                        : 'bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
