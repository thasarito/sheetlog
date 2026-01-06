import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
} from "lucide-react";
import type React from "react";
import type { CategoryItem, TransactionType } from "../lib/types";
import { CategoryGrid } from "./CategoryGrid";
import { AnimatedTabs } from "./ui/AnimatedTabs";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";

const TYPE_META: Record<
  TransactionType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  expense: { label: "Expense", icon: ArrowDownRight },
  income: { label: "Income", icon: ArrowUpRight },
  transfer: { label: "Transfer", icon: ArrowLeftRight },
};

const TYPE_OPTIONS: TransactionType[] = ["expense", "income", "transfer"];

const TYPE_TABS = TYPE_OPTIONS.map((type) => ({
  value: type,
  label: TYPE_META[type].label,
  icon: TYPE_META[type].icon,
}));

type CategoryGridDrawerProps = {
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
  categories: CategoryItem[];
  onSelect: (category: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layoutId?: string;
};

export function CategoryGridDrawer({
  type,
  onTypeChange,
  categories,
  onSelect,
  open,
  onOpenChange,
  layoutId = "categoryGridDrawer",
}: CategoryGridDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Select Category</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <AnimatedTabs
            tabs={TYPE_TABS}
            value={type}
            onChange={(value) => onTypeChange(value as TransactionType)}
            layoutId={layoutId}
          />
          <div className="h-[300px] overflow-y-auto">
            {categories.length > 0 ? (
              <CategoryGrid
                categories={categories}
                onSelect={(value) => {
                  onSelect(value);
                  onOpenChange(false);
                }}
                transactionType={type}
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                No categories available
              </span>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
