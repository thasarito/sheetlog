'use client';

import React from 'react';
import {
  BadgeDollarSign,
  Briefcase,
  Car,
  Coffee,
  CreditCard,
  Ellipsis,
  Film,
  Gift,
  HeartPulse,
  House,
  Percent,
  PiggyBank,
  Plane,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Utensils,
  Wifi,
} from 'lucide-react';

interface CategoryGridProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string) => void;
}

type CategoryMeta = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconClass: string;
  bgClass: string;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  'Food Delivery': {
    icon: Utensils,
    iconClass: 'text-amber-600 dark:text-amber-300',
    bgClass: 'bg-amber-100 dark:bg-amber-500/20',
  },
  'Dining Out': {
    icon: Utensils,
    iconClass: 'text-orange-600 dark:text-orange-300',
    bgClass: 'bg-orange-100 dark:bg-orange-500/20',
  },
  'Groceries & Home Supplies': {
    icon: ShoppingCart,
    iconClass: 'text-emerald-600 dark:text-emerald-300',
    bgClass: 'bg-emerald-100 dark:bg-emerald-500/20',
  },
  'Coffee & Snacks': {
    icon: Coffee,
    iconClass: 'text-amber-500 dark:text-amber-300',
    bgClass: 'bg-amber-100 dark:bg-amber-500/20',
  },
  Housing: {
    icon: House,
    iconClass: 'text-sky-600 dark:text-sky-300',
    bgClass: 'bg-sky-100 dark:bg-sky-500/20',
  },
  'Utilities & Connectivity': {
    icon: Wifi,
    iconClass: 'text-blue-600 dark:text-blue-300',
    bgClass: 'bg-blue-100 dark:bg-blue-500/20',
  },
  Transport: {
    icon: Car,
    iconClass: 'text-indigo-600 dark:text-indigo-300',
    bgClass: 'bg-indigo-100 dark:bg-indigo-500/20',
  },
  Subscriptions: {
    icon: Repeat,
    iconClass: 'text-violet-600 dark:text-violet-300',
    bgClass: 'bg-violet-100 dark:bg-violet-500/20',
  },
  Shopping: {
    icon: ShoppingBag,
    iconClass: 'text-pink-600 dark:text-pink-300',
    bgClass: 'bg-pink-100 dark:bg-pink-500/20',
  },
  'Entertainment & Social': {
    icon: Film,
    iconClass: 'text-purple-600 dark:text-purple-300',
    bgClass: 'bg-purple-100 dark:bg-purple-500/20',
  },
  Health: {
    icon: HeartPulse,
    iconClass: 'text-rose-600 dark:text-rose-300',
    bgClass: 'bg-rose-100 dark:bg-rose-500/20',
  },
  'Gifts & Donations': {
    icon: Gift,
    iconClass: 'text-red-600 dark:text-red-300',
    bgClass: 'bg-red-100 dark:bg-red-500/20',
  },
  'Work / Reimbursable': {
    icon: Briefcase,
    iconClass: 'text-cyan-600 dark:text-cyan-300',
    bgClass: 'bg-cyan-100 dark:bg-cyan-500/20',
  },
  Travel: {
    icon: Plane,
    iconClass: 'text-teal-600 dark:text-teal-300',
    bgClass: 'bg-teal-100 dark:bg-teal-500/20',
  },
  Salary: {
    icon: BadgeDollarSign,
    iconClass: 'text-emerald-600 dark:text-emerald-300',
    bgClass: 'bg-emerald-100 dark:bg-emerald-500/20',
  },
  Bonus: {
    icon: Sparkles,
    iconClass: 'text-yellow-600 dark:text-yellow-300',
    bgClass: 'bg-yellow-100 dark:bg-yellow-500/20',
  },
  Gift: {
    icon: Gift,
    iconClass: 'text-rose-600 dark:text-rose-300',
    bgClass: 'bg-rose-100 dark:bg-rose-500/20',
  },
  Interest: {
    icon: Percent,
    iconClass: 'text-lime-600 dark:text-lime-300',
    bgClass: 'bg-lime-100 dark:bg-lime-500/20',
  },
  Savings: {
    icon: PiggyBank,
    iconClass: 'text-amber-600 dark:text-amber-300',
    bgClass: 'bg-amber-100 dark:bg-amber-500/20',
  },
  Invest: {
    icon: TrendingUp,
    iconClass: 'text-emerald-600 dark:text-emerald-300',
    bgClass: 'bg-emerald-100 dark:bg-emerald-500/20',
  },
  'Credit Card': {
    icon: CreditCard,
    iconClass: 'text-indigo-600 dark:text-indigo-300',
    bgClass: 'bg-indigo-100 dark:bg-indigo-500/20',
  },
  Other: {
    icon: Ellipsis,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-surface-2',
  },
};

const FALLBACK_META: CategoryMeta = {
  icon: Sparkles,
  iconClass: 'text-muted-foreground',
  bgClass: 'bg-surface-2',
};

function resolveCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? FALLBACK_META;
}

export function CategoryGrid({
  categories,
  selected,
  onSelect,
}: CategoryGridProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {categories.map((category) => {
        const isSelected = selected === category;
        const meta = resolveCategoryMeta(category);
        const Icon = meta.icon;
        return (
          <button
            key={category}
            type="button"
            className={[
              'flex flex-col items-center rounded-2xl px-2 py-3 text-center transition',
              isSelected
                ? 'bg-accent ring-1 ring-primary/25'
                : 'hover:bg-surface',
            ].join(' ')}
            onClick={() => onSelect(category)}
          >
            <span
              className={[
                'flex h-12 w-12 items-center justify-center rounded-2xl border border-border shadow-sm transition',
                meta.bgClass,
                isSelected ? 'ring-2 ring-primary/30' : 'ring-1 ring-border/50',
              ].join(' ')}
            >
              <Icon className={['h-5 w-5', meta.iconClass].join(' ')} />
            </span>
            <span
              className={[
                'mt-2 text-[11px] font-semibold leading-snug text-muted-foreground',
                isSelected ? 'text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {category}
            </span>
          </button>
        );
      })}
    </div>
  );
}
