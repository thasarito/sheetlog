import { Tab } from '@headlessui/react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { TransactionType } from '../../lib/types';
import { CategoryGrid } from '../CategoryGrid';
import { DateTimeDrawer } from '../DateTimeDrawer';
import { TYPE_OPTIONS } from './constants';
import type { TransactionFormApi } from './useTransactionForm';

type StepCategoryProps = {
  form: TransactionFormApi;
  categoryGroups: Record<TransactionType, string[]>;
  onConfirm: () => void;
};

const TYPE_META: Record<
  TransactionType,
  {
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }
> = {
  expense: { label: 'Expense', icon: ArrowDownRight },
  income: { label: 'Income', icon: ArrowUpRight },
  transfer: { label: 'Transfer', icon: ArrowLeftRight },
};

export function StepCategory({ form, categoryGroups, onConfirm }: StepCategoryProps) {
  const { type, category, dateObject } = form.useStore((state) => state.values);
  const activeType = type ?? TYPE_OPTIONS[0];
  const selectedIndex = Math.max(0, TYPE_OPTIONS.indexOf(activeType));
  const [panelDirection, setPanelDirection] = useState<'left' | 'right'>('right');
  const lastIndexRef = useRef(selectedIndex);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const updateDirection = (nextIndex: number) => {
    const previousIndex = lastIndexRef.current;
    if (nextIndex > previousIndex) {
      setPanelDirection('right');
    } else if (nextIndex < previousIndex) {
      setPanelDirection('left');
    }
    lastIndexRef.current = nextIndex;
  };

  useEffect(() => {
    if (selectedIndex !== lastIndexRef.current) {
      updateDirection(selectedIndex);
    }
  }, [selectedIndex]);

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <Tab.Group
        selectedIndex={selectedIndex}
        onChange={handleTypeChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tab.List
          aria-label="Transaction type"
          className="grid grid-cols-3 gap-2 rounded-3xl border border-border/70 bg-surface-2/80 p-2"
        >
          {TYPE_OPTIONS.map((item) => {
            const meta = TYPE_META[item];
            const Icon = meta.icon;
            return (
              <Tab
                key={item}
                className={({ selected: isSelected }) =>
                  [
                    'flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    isSelected
                      ? 'bg-card text-foreground'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                  ].join(' ')
                }
              >
                {({ selected: isSelected }) => (
                  <>
                    <span
                      className={[
                        'flex h-9 w-9 items-center justify-center rounded-2xl transition',
                        isSelected ? 'bg-accent' : 'bg-card/70',
                      ].join(' ')}
                    >
                      <Icon
                        className={[
                          'h-4 w-4',
                          isSelected ? 'text-primary' : 'text-muted-foreground',
                        ].join(' ')}
                      />
                    </span>
                    <span>{meta.label}</span>
                  </>
                )}
              </Tab>
            );
          })}
        </Tab.List>

        <Tab.Panels className="relative flex-1 min-h-0 pt-4">
          {TYPE_OPTIONS.map((item) => {
            const group = categoryGroups[item] ?? [];
            return (
              <Tab.Panel
                key={item}
                static
                className={`absolute inset-0 h-full overflow-y-auto pb-2 transition duration-300 ease-out focus-visible:outline-none opacity-0 pointer-events-none data-[headlessui-state~='selected']:opacity-100 data-[headlessui-state~='selected']:pointer-events-auto data-[headlessui-state~='selected']:z-10 ${
                  panelDirection === 'right'
                    ? "translate-x-4 data-[headlessui-state~='selected']:translate-x-0"
                    : "-translate-x-4 data-[headlessui-state~='selected']:translate-x-0"
                }`}
              >
                <CategoryGrid
                  categories={group}
                  selected={category || null}
                  onSelect={handleCategorySelect}
                />
              </Tab.Panel>
            );
          })}
        </Tab.Panels>
      </Tab.Group>

      <DateTimeDrawer
        value={dateObject}
        onChange={(value) => form.setFieldValue('dateObject', value)}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        showTrigger={false}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
