import React from "react";
import { Tag, X } from "lucide-react";
import type { CategoryConfig, TransactionType } from "../../lib/types";
import { ScreenFrame } from "./ScreenFrame";
import type { CategoryInputs, ScreenMeta } from "./types";

const CATEGORY_LABELS: Record<TransactionType, string> = {
  expense: "Expense categories",
  income: "Income categories",
  transfer: "Transfer categories",
};

const CATEGORY_TYPES: TransactionType[] = ["expense", "income", "transfer"];

type CategoriesScreenProps = {
  meta: ScreenMeta;
  categories: CategoryConfig;
  categoryInputs: CategoryInputs;
  isSaving: boolean;
  onCategoryInputChange: (type: TransactionType, value: string) => void;
  onAddCategory: (type: TransactionType) => void;
  onRemoveCategory: (type: TransactionType, name: string) => void;
  onFinish: () => void;
};

export function CategoriesScreen({
  meta,
  categories,
  categoryInputs,
  isSaving,
  onCategoryInputChange,
  onAddCategory,
  onRemoveCategory,
  onFinish,
}: CategoriesScreenProps) {
  return (
    <ScreenFrame
      {...meta}
      title="Set up categories"
      subtitle="Customize the categories used in logging."
      icon={<Tag className="h-5 w-5" />}
      footer={
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          onClick={onFinish}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Finish setup"}
        </button>
      }
    >
      <div className="space-y-4">
        {CATEGORY_TYPES.map((type) => (
          <div
            key={type}
            className="space-y-3 rounded-2xl border border-border/70 bg-surface-2/80 p-4"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {CATEGORY_LABELS[type]}
            </p>
            {(categories[type] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No categories yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(categories[type] ?? []).map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-foreground shadow-sm"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition hover:text-foreground"
                      onClick={() => onRemoveCategory(type, item)}
                      aria-label={`Remove ${item}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Add a category"
                value={categoryInputs[type]}
                onChange={(event) =>
                  onCategoryInputChange(type, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void onAddCategory(type);
                }}
              />
              <button
                type="button"
                className="rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-60"
                onClick={() => onAddCategory(type)}
                disabled={!categoryInputs[type].trim()}
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
