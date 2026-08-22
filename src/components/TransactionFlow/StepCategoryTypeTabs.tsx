import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type React from "react";
import { triggerHapticFeedback } from "../../lib/transactionHaptics";
import type { TransactionType } from "../../lib/types";
import { AnimatedTabs } from "../ui/AnimatedTabs";
import { TYPE_OPTIONS } from "./constants";
import { clearTransactionPlace } from "./transactionNoteForm";
import type { TransactionFormApi } from "./useTransactionForm";

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  expense: { label: "Expense", icon: ArrowDownRight },
  income: { label: "Income", icon: ArrowUpRight },
  transfer: { label: "Transfer", icon: ArrowLeftRight },
};

const TRANSACTION_TYPE_TABS = TYPE_OPTIONS.map((type) => ({
  value: type,
  label: TRANSACTION_TYPE_META[type].label,
  icon: TRANSACTION_TYPE_META[type].icon,
}));

type StepCategoryTypeTabsProps = {
  form: TransactionFormApi;
  layoutId: string;
  onChange?: (value: TransactionType) => void;
  visualProgress?: number;
};

export function updateTransactionType(
  form: TransactionFormApi,
  currentType: TransactionType,
  nextType: TransactionType,
) {
  if (nextType === currentType) return;
  triggerHapticFeedback("selection");
  form.setFieldValue("type", nextType);
  if (nextType !== "expense") clearTransactionPlace(form);
  form.setFieldValue("category", "");
}

export function StepCategoryTypeTabs({
  form,
  layoutId,
  onChange,
  visualProgress,
}: StepCategoryTypeTabsProps) {
  const type = form.useStore((state) => state.values.type);
  const activeType = type ?? TYPE_OPTIONS[0];
  const handleChange = (nextType: TransactionType) => {
    if (onChange) {
      onChange(nextType);
      return;
    }
    updateTransactionType(form, activeType, nextType);
  };

  return (
    <AnimatedTabs
      tabs={TRANSACTION_TYPE_TABS}
      value={activeType}
      onChange={handleChange}
      layoutId={layoutId}
      variant="compact"
      visualProgress={visualProgress}
      selectionHaptics
    />
  );
}
