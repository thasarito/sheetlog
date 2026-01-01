"use client";

import React from "react";
import { Tab } from "@headlessui/react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
} from "lucide-react";
import type { TransactionType } from "../../lib/types";
import { CategoryGrid } from "../CategoryGrid";
import { TagChips } from "../TagChips";
import { TAGS, TYPE_OPTIONS } from "./constants";

type StepCategoryProps = {
  type: TransactionType;
  categoryGroups: Record<TransactionType, { frequent: string[]; others: string[] }>;
  selected: string | null;
  tags: string[];
  onSelectType: (value: TransactionType) => void;
  onSelectCategory: (value: string) => void;
  onToggleTag: (value: string) => void;
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
  tags,
  onSelectType,
  onSelectCategory,
  onToggleTag,
}: StepCategoryProps) {
  const activeType = type ?? TYPE_OPTIONS[0];
  const selectedIndex = Math.max(0, TYPE_OPTIONS.indexOf(activeType));

  return (
    <div className="space-y-6">
      <Tab.Group
        selectedIndex={selectedIndex}
        onChange={(index) => onSelectType(TYPE_OPTIONS[index])}
      >
        <Tab.List
          aria-label="Transaction type"
          className="grid grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-white/5 p-2"
        >
          {TYPE_OPTIONS.map((item) => {
            const meta = TYPE_META[item];
            const Icon = meta.icon;
            return (
              <Tab
                key={item}
                className={({ selected: isSelected }) =>
                  [
                    "flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
                    isSelected
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-200 hover:bg-white/10",
                  ].join(" ")
                }
              >
                {({ selected: isSelected }) => (
                  <>
                    <span
                      className={[
                        "flex h-9 w-9 items-center justify-center rounded-2xl transition",
                        isSelected ? "bg-slate-100" : "bg-white/10",
                      ].join(" ")}
                    >
                      <Icon
                        className={[
                          "h-4 w-4",
                          isSelected ? "text-slate-900" : "text-slate-200",
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

        <Tab.Panels className="pt-4">
          {TYPE_OPTIONS.map((item) => {
            const group = categoryGroups[item] ?? {
              frequent: [],
              others: [],
            };
            return (
              <Tab.Panel key={item} className="focus-visible:outline-none">
                <CategoryGrid
                  frequent={group.frequent}
                  others={group.others}
                  selected={selected}
                  onSelect={onSelectCategory}
                />
              </Tab.Panel>
            );
          })}
        </Tab.Panels>
      </Tab.Group>

      <div className="pt-1">
        <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">
          Tags
        </p>
        <TagChips tags={TAGS} selected={tags} onToggle={onToggleTag} />
      </div>
    </div>
  );
}
