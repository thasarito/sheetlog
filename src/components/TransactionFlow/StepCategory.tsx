import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getQuickNotesForCategory, useQuickNotesQuery } from '../../hooks/useQuickNotes';
import type { CategoryItem, QuickNote, TransactionType } from '../../lib/types';
import { CategoryGrid } from '../CategoryGrid';
import { DateTimeDrawer } from '../DateTimeDrawer';
import { RadialMenu } from '../RadialMenu';
import { useRadialMenu } from '../RadialMenu/useRadialMenu';
import { AnimatedTabs } from '../ui/AnimatedTabs';
import { TYPE_OPTIONS } from './constants';
import type { TransactionFormApi } from './useTransactionForm';

type StepCategoryProps = {
  form: TransactionFormApi;
  categoryGroups: Record<TransactionType, CategoryItem[]>;
  onConfirm: () => void;
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

const panelVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%' }),
  center: { x: 0 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%' }),
};

export function StepCategory({ form, categoryGroups, onConfirm }: StepCategoryProps) {
  const { type, dateObject } = form.useStore((state) => state.values);
  const activeType = type ?? TYPE_OPTIONS[0];
  const selectedIndex = Math.max(0, TYPE_OPTIONS.indexOf(activeType));
  const [direction, setDirection] = useState(0);
  const lastIndexRef = useRef(selectedIndex);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
      form.setFieldValue('note', selectedNote.note ?? '');
      form.setFieldValue('dateObject', new Date());
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

  const updateDirection = useCallback((nextIndex: number) => {
    const previousIndex = lastIndexRef.current;
    if (nextIndex > previousIndex) {
      setDirection(1);
    } else if (nextIndex < previousIndex) {
      setDirection(-1);
    } else {
      setDirection(0);
    }
    lastIndexRef.current = nextIndex;
  }, []);

  useEffect(() => {
    if (selectedIndex !== lastIndexRef.current) {
      updateDirection(selectedIndex);
    }
  }, [selectedIndex, updateDirection]);

  const handleCategorySelect = (value: string) => {
    form.setFieldValue('category', value);
    form.setFieldValue('dateObject', new Date());
    setIsDrawerOpen(true);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  const handleTypeChange = (index: number) => {
    updateDirection(index);
    const nextType = TYPE_OPTIONS[index];
    form.setFieldValue('type', nextType);
    if (nextType !== type) {
      form.setFieldValue('category', '');
    }
  };

  const activeGroup = categoryGroups[activeType] ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 select-none">
      <div className="flex min-h-0 flex-1 flex-col">
        <AnimatedTabs
          tabs={TYPE_TABS}
          value={activeType}
          onChange={(value) => {
            const index = TYPE_OPTIONS.indexOf(value);
            handleTypeChange(index);
          }}
          layoutId="transactionType"
        />

        <div className="relative flex-1 min-h-0 pt-4 overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={activeType}
              custom={direction}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              className="absolute inset-0 h-full overflow-y-auto pb-2"
            >
              <CategoryGrid
                categories={activeGroup}
                onSelect={handleCategorySelect}
                onLongPress={radialHandlers.onLongPressStart}
                onDrag={radialHandlers.onDrag}
                onRelease={radialHandlers.onRelease}
                transactionType={activeType}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <DateTimeDrawer
        value={dateObject}
        onChange={(value) => form.setFieldValue('dateObject', value)}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        showTrigger={false}
        onConfirm={handleConfirm}
      />

      {/* Radial menu for quick notes */}
      {radialMenuState && (
        <RadialMenu
          items={menuItems}
          anchorPosition={radialMenuState.anchorPosition}
          dragPosition={radialMenuState.dragPosition}
          isOpen={radialMenuState.isOpen}
          onSelectItem={() => {}}
          onCancel={radialHandlers.onCancel}
        />
      )}
    </div>
  );
}
