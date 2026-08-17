import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getQuickNotesForCategory, useQuickNotesQuery } from '../../hooks/useQuickNotes';
import type { CategoryItem, QuickNote, TransactionType } from '../../lib/types';
import { CategoryGrid } from '../CategoryGrid';
import { DateTimeDrawer } from '../DateTimeDrawer';
import { RadialMenu } from '../RadialMenu';
import { useRadialMenu } from '../RadialMenu/useRadialMenu';
import { AnimatedTabs } from '../ui/AnimatedTabs';
import { TYPE_OPTIONS } from './constants';
import {
  clearTransactionPlace,
  replaceTransactionNote,
} from './transactionNoteForm';
import type { TransactionFormApi } from './useTransactionForm';

type StepCategoryProps = {
  form: TransactionFormApi;
  categoryGroups: Record<TransactionType, CategoryItem[]>;
  onConfirm: () => void;
  drawerContainer?: HTMLElement | null;
};

const TYPE_META: Record<
  TransactionType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  expense: { label: 'Expense', icon: ArrowDownRight },
  income: { label: 'Income', icon: ArrowUpRight },
  transfer: { label: 'Transfer', icon: ArrowLeftRight },
};

const TYPE_TABS = TYPE_OPTIONS.map((type) => ({
  value: type,
  label: TYPE_META[type].label,
  icon: TYPE_META[type].icon,
}));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function StepCategory({
  form,
  categoryGroups,
  onConfirm,
  drawerContainer,
}: StepCategoryProps) {
  const { type, dateObject } = form.useStore((state) => state.values);
  const activeType = type ?? TYPE_OPTIONS[0];
  const selectedIndex = Math.max(0, TYPE_OPTIONS.indexOf(activeType));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  const { data: quickNotesConfig } = useQuickNotesQuery();

  // Radial menu hook
  const {
    state: radialMenuState,
    handlers: radialHandlers,
    menuItems,
  } = useRadialMenu<QuickNote>({
    getItems: (category) => getQuickNotesForCategory(quickNotesConfig, activeType, category),
    getItemId: (note) => note.id,
    getItemIcon: (note) => note.icon,
    getItemLabel: (note) => note.label,
    onSelect: (selectedNote, category) => {
      if (!selectedNote) return;
      form.setFieldValue('category', category);
      replaceTransactionNote(form, selectedNote.note ?? '');
      form.setFieldValue('dateObject', new Date());
      if (selectedNote.amount) {
        form.setFieldValue('amount', selectedNote.amount);
      }
      if (selectedNote.currency) {
        form.setFieldValue('currency', selectedNote.currency);
      }
      if (selectedNote.account) {
        form.setFieldValue('account', selectedNote.account);
      }
      if (selectedNote.forValue) {
        form.setFieldValue('forValue', selectedNote.forValue);
      }
      setIsDrawerOpen(true);
    },
    onDefault: (category) => {
      form.setFieldValue('category', category);
      form.setFieldValue('dateObject', new Date());
      setIsDrawerOpen(true);
    },
  });

  const commitTypeIndex = useCallback(
    (index: number) => {
      const boundedIndex = Math.max(0, Math.min(TYPE_OPTIONS.length - 1, index));
      const nextType = TYPE_OPTIONS[boundedIndex];
      if (nextType === type) return;
      form.setFieldValue('type', nextType);
      if (nextType !== 'expense') clearTransactionPlace(form);
      form.setFieldValue('category', '');
    },
    [form, type],
  );

  const scrollToType = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const boundedIndex = Math.max(0, Math.min(TYPE_OPTIONS.length - 1, index));
      const reducedMotion = prefersReducedMotion();
      viewport.scrollTo({
        left: boundedIndex * viewport.clientWidth,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      if (reducedMotion) commitTypeIndex(boundedIndex);
    },
    [commitTypeIndex],
  );

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;
    const index = Math.max(
      0,
      Math.min(
        TYPE_OPTIONS.length - 1,
        Math.round(viewport.scrollLeft / viewport.clientWidth),
      ),
    );
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(() => commitTypeIndex(index), 80);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current) return;
    const x = Math.abs(event.clientX - pointerStartRef.current.x);
    const y = Math.abs(event.clientY - pointerStartRef.current.y);
    if (x > 8 && x > y) suppressClickRef.current = true;
  };

  const handlePointerUp = () => {
    pointerStartRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;
    const targetLeft = selectedIndex * viewport.clientWidth;
    if (Math.abs(viewport.scrollLeft - targetLeft) > 1) {
      viewport.scrollTo({ left: targetLeft, behavior: 'auto' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    for (const [index, slide] of slideRefs.current.entries()) {
      if (slide) slide.inert = index !== selectedIndex;
    }
  }, [selectedIndex]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  const handleCategorySelect = (value: string) => {
    form.setFieldValue('category', value);
    form.setFieldValue('dateObject', new Date());
    setIsDrawerOpen(true);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Transaction type and categories"
      className="flex h-full min-h-0 flex-col select-none"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        const isNavigationTarget =
          target === viewportRef.current ||
          Boolean(target.closest('[data-animated-tabs-variant="compact"]'));
        if (!isNavigationTarget) return;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          scrollToType(selectedIndex + 1);
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          scrollToType(selectedIndex - 1);
        }
      }}
    >
      <AnimatedTabs
        tabs={TYPE_TABS}
        value={activeType}
        onChange={(value) => scrollToType(TYPE_OPTIONS.indexOf(value))}
        layoutId="transactionType"
        variant="compact"
      />

      <div
        ref={viewportRef}
        data-testid="transaction-type-carousel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll viewport needs a keyboard target for arrow-key slide navigation
        tabIndex={0}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        className="mt-3 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-x_pan-y] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TYPE_OPTIONS.map((typeOption, index) => (
          <section
            key={typeOption}
            ref={(node) => {
              slideRefs.current[index] = node;
            }}
            aria-label={`${TYPE_META[typeOption].label} categories, slide ${index + 1} of ${TYPE_OPTIONS.length}`}
            aria-hidden={selectedIndex !== index}
            className="h-full min-w-full snap-center snap-always overflow-y-auto pb-2"
          >
            <CategoryGrid
              categories={categoryGroups[typeOption] ?? []}
              onSelect={handleCategorySelect}
              onLongPress={radialHandlers.onLongPressStart}
              onDrag={radialHandlers.onDrag}
              onRelease={radialHandlers.onRelease}
              transactionType={typeOption}
            />
          </section>
        ))}
      </div>

      <DateTimeDrawer
        value={dateObject}
        onChange={(value) => form.setFieldValue('dateObject', value)}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        showTrigger={false}
        container={drawerContainer}
        onConfirm={handleConfirm}
      />

      {/* Radial menu for quick notes */}
      {radialMenuState && (
        <RadialMenu
          items={menuItems}
          anchorPosition={radialMenuState.anchorPosition}
          dragPosition={radialMenuState.dragPosition}
          isOpen={radialMenuState.isOpen}
          onCancel={radialHandlers.onCancel}
        />
      )}
    </section>
  );
}
