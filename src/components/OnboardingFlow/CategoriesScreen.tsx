import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { OnboardingLayout } from "./OnboardingLayout";
import type { CategoryConfigWithMeta, CategoryItem, TransactionType } from "../../lib/types";
import type { ScreenMeta } from "./types";
import { cn } from "../../lib/utils";
import {
  SUGGESTED_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
} from "../../lib/icons";

type CategoriesScreenProps = {
  meta: ScreenMeta;
  categories: CategoryConfigWithMeta;
  isSaving: boolean;
  onChange: (categories: CategoryConfigWithMeta) => void;
  onContinue: () => void;
};

type TabType = TransactionType;

export function CategoriesScreen({
  meta,
  categories,
  isSaving,
  onChange,
  onContinue,
}: CategoriesScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>("expense");
  const [newInputs, setNewInputs] = useState<Record<TabType, string>>({
    expense: "",
    income: "",
    transfer: "",
  });

  const tabs: { id: TabType; label: string; color: string }[] = [
    { id: "expense", label: "Expense", color: "text-red-500 bg-red-50" },
    { id: "income", label: "Income", color: "text-green-500 bg-green-50" },
    { id: "transfer", label: "Transfer", color: "text-blue-500 bg-blue-50" },
  ];

  function handleAdd(type: TabType) {
    const val = newInputs[type].trim();
    if (!val) return;
    if (categories[type].some((c) => c.name.toLowerCase() === val.toLowerCase())) return;

    const newCategory: CategoryItem = {
      name: val,
      icon: SUGGESTED_CATEGORY_ICONS[val] || DEFAULT_CATEGORY_ICONS[type],
      color: SUGGESTED_CATEGORY_COLORS[val] || DEFAULT_CATEGORY_COLORS[type],
    };

    onChange({
      ...categories,
      [type]: [...categories[type], newCategory],
    });
    setNewInputs((prev) => ({ ...prev, [type]: "" }));
  }

  function handleRemove(type: TabType, name: string) {
    onChange({
      ...categories,
      [type]: categories[type].filter((c) => c.name !== name),
    });
  }

  return (
    <OnboardingLayout
      title="Customize categories"
      subtitle="Organize your spending your way."
      stepCurrent={meta.stepNumber}
      stepTotal={meta.totalSteps}
    >
      <div className="flex flex-col h-full space-y-4 pt-2">
        {/* Tabs */}
        <div className="flex p-1 bg-muted/40 rounded-xl border border-border/40">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                activeTab === tab.id
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder={`Add ${activeTab} category...`}
            value={newInputs[activeTab]}
            onChange={(e) =>
              setNewInputs((prev) => ({ ...prev, [activeTab]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd(activeTab);
            }}
          />
          <button
            type="button"
            className="flex items-center justify-center rounded-2xl bg-secondary px-4 font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            onClick={() => handleAdd(activeTab)}
            disabled={!newInputs[activeTab].trim()}
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Tags List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-wrap gap-2 content-start pb-4">
            {categories[activeTab].map((cat) => (
              <div
                key={cat.name}
                className="animate-in fade-in zoom-in-95 duration-200"
              >
                <span
                  className={cn(
                    "inline-flex items-center pl-3 pr-2 py-1.5 rounded-full text-sm font-medium border transition-all",
                    "bg-card border-border/50",
                    activeTab === "expense" &&
                      "hover:border-red-200 hover:bg-red-50/50",
                    activeTab === "income" &&
                      "hover:border-green-200 hover:bg-green-50/50",
                    activeTab === "transfer" &&
                      "hover:border-blue-200 hover:bg-blue-50/50"
                  )}
                >
                  {cat.name}
                  <button
                    type="button"
                    className="ml-1.5 p-0.5 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition"
                    onClick={() => handleRemove(activeTab, cat.name)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            ))}
            {categories[activeTab].length === 0 && (
              <div className="w-full py-8 text-center text-muted-foreground/60 text-sm">
                No categories yet
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          onClick={onContinue}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "All Set"}
        </button>
      </div>
    </OnboardingLayout>
  );
}
