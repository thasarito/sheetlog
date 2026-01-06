import { DynamicIcon } from "./DynamicIcon";
import type { CategoryItem, TransactionType } from "../lib/types";
import {
  SUGGESTED_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
} from "../lib/icons";

interface CategoryGridProps {
  categories: CategoryItem[];
  selected: string | null;
  onSelect: (category: string) => void;
  transactionType?: TransactionType;
}

function resolveCategoryIcon(
  category: CategoryItem,
  type: TransactionType = "expense"
): string {
  return (
    category.icon ||
    SUGGESTED_CATEGORY_ICONS[category.name] ||
    DEFAULT_CATEGORY_ICONS[type]
  );
}

function resolveCategoryColor(
  category: CategoryItem,
  type: TransactionType = "expense"
): string {
  return (
    category.color ||
    SUGGESTED_CATEGORY_COLORS[category.name] ||
    DEFAULT_CATEGORY_COLORS[type]
  );
}

export function CategoryGrid({
  categories,
  selected,
  onSelect,
  transactionType = "expense",
}: CategoryGridProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {categories.map((category) => {
        const isSelected = selected === category.name;
        const icon = resolveCategoryIcon(category, transactionType);
        const color = resolveCategoryColor(category, transactionType);

        return (
          <button
            key={category.name}
            type="button"
            className={[
              "flex flex-col items-center rounded-2xl px-2 py-3 text-center transition",
              isSelected
                ? "bg-accent ring-1 ring-primary/25"
                : "hover:bg-surface",
            ].join(" ")}
            onClick={() => onSelect(category.name)}
          >
            <span
              className={[
                "flex h-12 w-12 items-center justify-center rounded-2xl border border-border transition",
                isSelected ? "ring-2 ring-primary/30" : "ring-1 ring-border/50",
              ].join(" ")}
              style={{ backgroundColor: `${color}20` }}
            >
              <DynamicIcon name={icon} className="h-5 w-5" style={{ color }} />
            </span>
            <span
              className={[
                "mt-2 text-[11px] font-semibold leading-snug",
                isSelected ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {category.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
