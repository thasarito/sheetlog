"use client";

import React, { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { RefreshCw, X } from "lucide-react";
import { z } from "zod";
import type { TransactionType } from "../../lib/types";
import { useOnboarding } from "../providers";
import { TYPE_OPTIONS } from "./constants";

type AccountCategoryPanelProps = {
  onToast: (message: string) => void;
  onResync: () => void;
  isResyncing: boolean;
};

type PanelView = "accounts" | "categories";

type CategoryInputs = Record<TransactionType, string>;

const CATEGORY_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

const accountNameSchema = z.string().trim().min(1, "Enter an account name");

export function AccountCategoryPanel({
  onToast,
  onResync,
  isResyncing,
}: AccountCategoryPanelProps) {
  const { onboarding, updateOnboarding } = useOnboarding();
  const [activeView, setActiveView] = useState<PanelView>("accounts");
  const [activeCategoryType, setActiveCategoryType] = useState<TransactionType>(
    TYPE_OPTIONS[0]
  );
  const [categoryInputs, setCategoryInputs] = useState<CategoryInputs>({
    expense: "",
    income: "",
    transfer: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const accounts = onboarding.accounts;
  const categories = onboarding.categories;
  const activeCategories = categories[activeCategoryType] ?? [];

  const accountForm = useForm({
    defaultValues: { accountName: "" },
    onSubmit: async ({ value }) => {
      if (isSaving) {
        return;
      }
      const nextValue = value.accountName.trim();
      if (!nextValue) {
        onToast("Enter an account name");
        return;
      }
      const exists = accounts.some(
        (item) => item.toLowerCase() === nextValue.toLowerCase()
      );
      if (exists) {
        onToast("Account already added");
        return;
      }
      setIsSaving(true);
      try {
        await updateOnboarding({
          accounts: [...accounts, nextValue],
          accountsConfirmed: true,
        });
        accountForm.reset();
      } catch {
        onToast("Failed to add account");
      } finally {
        setIsSaving(false);
      }
    },
  });

  async function removeAccount(name: string) {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({
        accounts: accounts.filter((item) => item !== name),
        accountsConfirmed: true,
      });
    } catch {
      onToast("Failed to remove account");
    } finally {
      setIsSaving(false);
    }
  }

  async function addCategory(type: TransactionType) {
    if (isSaving) {
      return;
    }
    const nextValue = categoryInputs[type].trim();
    if (!nextValue) {
      onToast("Enter a category");
      return;
    }
    const list = categories[type] ?? [];
    const exists = list.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast("Category already added");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({
        categories: {
          ...categories,
          [type]: [...list, nextValue],
        },
        categoriesConfirmed: true,
      });
      setCategoryInputs((prev) => ({
        ...prev,
        [type]: "",
      }));
    } catch {
      onToast("Failed to add category");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCategory(type: TransactionType, name: string) {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({
        categories: {
          ...categories,
          [type]: (categories[type] ?? []).filter((item) => item !== name),
        },
        categoriesConfirmed: true,
      });
    } catch {
      onToast("Failed to remove category");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-3xl border border-border/70 bg-surface-2/80 p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Manage
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-surface disabled:opacity-60"
            onClick={onResync}
            disabled={isResyncing}
            aria-label="Re-sync accounts and categories"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isResyncing ? "animate-spin" : ""}`}
            />
          </button>
          <div className="flex rounded-full bg-card/70 p-1 text-[11px] font-semibold">
            <button
              type="button"
              className={[
                "rounded-full px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                activeView === "accounts"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setActiveView("accounts")}
            >
              Accounts
            </button>
            <button
              type="button"
              className={[
                "rounded-full px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                activeView === "categories"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setActiveView("categories")}
            >
              Categories
            </button>
          </div>
        </div>
      </div>

      {activeView === "accounts" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <div
                    key={account}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground"
                  >
                    <span>{account}</span>
                    <button
                      type="button"
                      className="text-muted-foreground transition hover:text-foreground"
                      onClick={() => removeAccount(account)}
                      aria-label={`Remove ${account}`}
                      disabled={isSaving}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No accounts yet.
                </p>
              )}
            </div>
          </div>
          <form
            className="flex gap-2 items-start"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void accountForm.handleSubmit();
            }}
          >
            <accountForm.Field
              name="accountName"
              validators={{
                onChange: ({ value }) => {
                  const parsed = accountNameSchema.safeParse(value);
                  if (!parsed.success) {
                    return parsed.error.issues[0]?.message;
                  }
                  return undefined;
                },
              }}
            >
              {(field) => {
                const error = field.state.meta.errors?.[0];
                return (
                  <div className="flex-1">
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
                      placeholder="Add account"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      disabled={isSaving}
                    />
                    {error ? (
                      <p className="mt-1 text-[11px] text-danger">{error}</p>
                    ) : null}
                  </div>
                );
              }}
            </accountForm.Field>
            <button
              type="submit"
              className="self-start rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
              disabled={isSaving}
            >
              Add
            </button>
          </form>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex rounded-full border border-border bg-card/70 p-1 text-[11px] font-semibold uppercase tracking-wider">
            {TYPE_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className={[
                  "flex-1 rounded-full px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  activeCategoryType === item
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                onClick={() => setActiveCategoryType(item)}
              >
                {CATEGORY_LABELS[item]}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {activeCategories.length > 0 ? (
                activeCategories.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      className="text-muted-foreground transition hover:text-foreground"
                      onClick={() => removeCategory(activeCategoryType, item)}
                      aria-label={`Remove ${item}`}
                      disabled={isSaving}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No categories yet.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
              placeholder={`Add ${CATEGORY_LABELS[activeCategoryType]}`}
              value={categoryInputs[activeCategoryType]}
              onChange={(event) =>
                setCategoryInputs((prev) => ({
                  ...prev,
                  [activeCategoryType]: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void addCategory(activeCategoryType);
              }}
            />
            <button
              type="button"
              className="rounded-2xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
              onClick={() => void addCategory(activeCategoryType)}
              disabled={isSaving}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
