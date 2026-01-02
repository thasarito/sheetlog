"use client";

import React, { useState } from "react";
import { Tab } from "@headlessui/react";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { TransactionType } from "../../lib/types";
import { CategoryGrid } from "../CategoryGrid";
import { DateTimeDrawer } from "../DateTimeDrawer";
import { TYPE_OPTIONS } from "./constants";

type StepCategoryProps = {
  type: TransactionType;
  categoryGroups: Record<TransactionType, string[]>;
  selected: string | null;
  dateObject: Date;
  onSelectType: (value: TransactionType) => void;
  onSelectCategory: (value: string) => void;
  onDateChange: (value: Date) => void;
  onConfirm: () => void;
};

const TYPE_META: Record<
  TransactionType,
  {
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }
> = {
  expense: { label: "Expense", icon: ArrowDownRight },
  income: { label: "Income", icon: ArrowUpRight },
  transfer: { label: "Transfer", icon: ArrowLeftRight },
};

export function StepCategory({
  type,
  categoryGroups,
  selected,
  dateObject,
  onSelectType,
  onSelectCategory,
  onDateChange,
  onConfirm,
}: StepCategoryProps) {
  const activeType = type ?? TYPE_OPTIONS[0];
  const selectedIndex = Math.max(0, TYPE_OPTIONS.indexOf(activeType));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleCategorySelect = (value: string) => {
    onSelectCategory(value);
    setIsDrawerOpen(true);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <Tab.Group
        selectedIndex={selectedIndex}
        onChange={(index) => onSelectType(TYPE_OPTIONS[index])}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tab.List
          aria-label="Transaction type"
          className="grid grid-cols-3 gap-2 rounded-3xl border border-border/70 bg-surface-2/80 p-2 shadow-inner"
        >
          {TYPE_OPTIONS.map((item) => {
            const meta = TYPE_META[item];
            const Icon = meta.icon;
            return (
              <Tab
                key={item}
                className={({ selected: isSelected }) =>
                  [
                    "flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isSelected
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                  ].join(" ")
                }
              >
                {({ selected: isSelected }) => (
                  <>
                    <span
                      className={[
                        "flex h-9 w-9 items-center justify-center rounded-2xl transition",
                        isSelected ? "bg-accent" : "bg-card/70",
                      ].join(" ")}
                    >
                      <Icon
                        className={[
                          "h-4 w-4",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        ].join(" ")}
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
                className={`absolute inset-0 h-full overflow-y-auto pb-2 transition duration-300 ease-out focus-visible:outline-none opacity-0 translate-y-2 pointer-events-none data-[headlessui-state~='selected']:opacity-100 data-[headlessui-state~='selected']:translate-y-0 data-[headlessui-state~='selected']:pointer-events-auto data-[headlessui-state~='selected']:z-10`}
              >
                <CategoryGrid
                  categories={group}
                  selected={selected}
                  onSelect={handleCategorySelect}
                />
              </Tab.Panel>
            );
          })}
        </Tab.Panels>
      </Tab.Group>

      <DateTimeDrawer
        value={dateObject}
        onChange={onDateChange}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        showTrigger={false}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
