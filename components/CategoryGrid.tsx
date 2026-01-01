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
  frequent: string[];
  others: string[];
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
    iconClass: 'text-amber-300',
    bgClass: 'bg-amber-500/10',
  },
  'Dining Out': {
    icon: Utensils,
    iconClass: 'text-orange-300',
    bgClass: 'bg-orange-500/10',
  },
  'Groceries & Home Supplies': {
    icon: ShoppingCart,
    iconClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/10',
  },
  'Coffee & Snacks': {
    icon: Coffee,
    iconClass: 'text-amber-200',
    bgClass: 'bg-amber-500/10',
  },
  Housing: {
    icon: House,
    iconClass: 'text-sky-300',
    bgClass: 'bg-sky-500/10',
  },
  'Utilities & Connectivity': {
    icon: Wifi,
    iconClass: 'text-blue-300',
    bgClass: 'bg-blue-500/10',
  },
  Transport: {
    icon: Car,
    iconClass: 'text-indigo-300',
    bgClass: 'bg-indigo-500/10',
  },
  Subscriptions: {
    icon: Repeat,
    iconClass: 'text-violet-300',
    bgClass: 'bg-violet-500/10',
  },
  Shopping: {
    icon: ShoppingBag,
    iconClass: 'text-pink-300',
    bgClass: 'bg-pink-500/10',
  },
  'Entertainment & Social': {
    icon: Film,
    iconClass: 'text-purple-300',
    bgClass: 'bg-purple-500/10',
  },
  Health: {
    icon: HeartPulse,
    iconClass: 'text-rose-300',
    bgClass: 'bg-rose-500/10',
  },
  'Gifts & Donations': {
    icon: Gift,
    iconClass: 'text-red-300',
    bgClass: 'bg-red-500/10',
  },
  'Work / Reimbursable': {
    icon: Briefcase,
    iconClass: 'text-cyan-300',
    bgClass: 'bg-cyan-500/10',
  },
  Travel: {
    icon: Plane,
    iconClass: 'text-teal-300',
    bgClass: 'bg-teal-500/10',
  },
  Salary: {
    icon: BadgeDollarSign,
    iconClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/10',
  },
  Bonus: {
    icon: Sparkles,
    iconClass: 'text-yellow-300',
    bgClass: 'bg-yellow-500/10',
  },
  Gift: {
    icon: Gift,
    iconClass: 'text-rose-300',
    bgClass: 'bg-rose-500/10',
  },
  Interest: {
    icon: Percent,
    iconClass: 'text-lime-300',
    bgClass: 'bg-lime-500/10',
  },
  Savings: {
    icon: PiggyBank,
    iconClass: 'text-amber-300',
    bgClass: 'bg-amber-500/10',
  },
  Invest: {
    icon: TrendingUp,
    iconClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/10',
  },
  'Credit Card': {
    icon: CreditCard,
    iconClass: 'text-indigo-300',
    bgClass: 'bg-indigo-500/10',
  },
  Other: {
    icon: Ellipsis,
    iconClass: 'text-slate-300',
    bgClass: 'bg-white/10',
  },
};

const FALLBACK_META: CategoryMeta = {
  icon: Sparkles,
  iconClass: 'text-slate-200',
  bgClass: 'bg-white/10',
};

function resolveCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? FALLBACK_META;
}

export function CategoryGrid({
  frequent,
  others,
  selected,
  onSelect,
}: CategoryGridProps) {
  const items = [...frequent, ...others];
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((category) => {
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
                ? 'bg-emerald-500/10 ring-1 ring-emerald-400/40'
                : 'hover:bg-white/5',
            ].join(' ')}
            onClick={() => onSelect(category)}
          >
            <span
              className={[
                'flex h-12 w-12 items-center justify-center rounded-2xl transition',
                meta.bgClass,
                isSelected ? 'ring-2 ring-emerald-300/70' : 'ring-1 ring-white/10',
              ].join(' ')}
            >
              <Icon className={['h-5 w-5', meta.iconClass].join(' ')} />
            </span>
            <span
              className={[
                'mt-2 text-[11px] font-semibold leading-snug text-slate-200',
                isSelected ? 'text-emerald-200' : 'text-slate-200',
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
