import { useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { AnimatedTabs } from "./ui/AnimatedTabs";
import { SwipeableListItem } from "./SwipeableListItem";
import { useOnboarding } from "../hooks/useOnboarding";
import { useAccountMutations } from "../hooks/useAccountMutations";
import { useCategoryMutations } from "../hooks/useCategoryMutations";
import { DynamicIcon } from "./DynamicIcon";
import { IconPicker } from "./IconPicker";
import { ColorPicker } from "./ColorPicker";
import type { TransactionType } from "../lib/types";
import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
} from "../lib/icons";

type SettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResync: () => void;
  isResyncing: boolean;
  onToast: (message: string) => void;
};

type ActiveView = "accounts" | "categories";

type EditingItem = {
  type: "account" | "category";
  name: string;
  field: "icon" | "color";
};

const SETTINGS_TABS = [
  { value: "accounts" as const, label: "Accounts" },
  { value: "categories" as const, label: "Categories" },
];

const CATEGORY_TYPES: { key: TransactionType; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfer" },
];

export function SettingsDrawer({
  open,
  onOpenChange,
  onResync,
  isResyncing,
  onToast,
}: SettingsDrawerProps) {
  const { onboarding } = useOnboarding();
  const {
    addAccount,
    removeAccount,
    updateAccountMeta,
    isSaving: isAccountSaving,
  } = useAccountMutations(onToast);
  const {
    addCategory,
    removeCategory,
    updateCategoryMeta,
    isSaving: isCategorySaving,
  } = useCategoryMutations(onToast);
  const isSaving = isAccountSaving || isCategorySaving;

  const [activeView, setActiveView] = useState<ActiveView>("accounts");
  const [activeCategoryType, setActiveCategoryType] =
    useState<TransactionType>("expense");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);

  const accounts = onboarding.accounts ?? [];
  const categories = onboarding.categories ?? {
    expense: [],
    income: [],
    transfer: [],
  };
  const activeCategories = categories[activeCategoryType] ?? [];

  // Get current item being edited
  const currentEditItem =
    editingItem?.type === "account"
      ? accounts.find((a) => a.name === editingItem.name)
      : activeCategories.find((c) => c.name === editingItem?.name);

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  function handleAddAccount() {
    const trimmed = newAccountName.trim();
    if (!trimmed) {
      onToast("Enter an account name");
      return;
    }
    if (accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      onToast("Account already exists");
      return;
    }
    addAccount.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setNewAccountName("");
          setIsAddingAccount(false);
        },
      }
    );
  }

  function handleAddCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      onToast("Enter a category name");
      return;
    }
    const list = categories[activeCategoryType] ?? [];
    if (list.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      onToast("Category already exists");
      return;
    }
    addCategory.mutate(
      { name: trimmed, categoryType: activeCategoryType },
      {
        onSuccess: () => {
          setNewCategoryName("");
          setIsAddingCategory(false);
        },
      }
    );
  }

  // Reset form states when switching views
  function handleViewChange(view: ActiveView) {
    setActiveView(view);
    setIsAddingAccount(false);
    setIsAddingCategory(false);
    setNewAccountName("");
    setNewCategoryName("");
  }

  // Handle icon/color selection
  function handleIconSelect(icon: string) {
    if (!editingItem) return;
    if (editingItem.type === "account") {
      updateAccountMeta.mutate({ name: editingItem.name, icon });
    } else {
      updateCategoryMeta.mutate({
        name: editingItem.name,
        categoryType: activeCategoryType,
        icon,
      });
    }
    setEditingItem(null);
  }

  function handleColorSelect(color: string) {
    if (!editingItem) return;
    if (editingItem.type === "account") {
      updateAccountMeta.mutate({ name: editingItem.name, color });
    } else {
      updateCategoryMeta.mutate({
        name: editingItem.name,
        categoryType: activeCategoryType,
        color,
      });
    }
    setEditingItem(null);
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[65vh]!">
          <DrawerHeader className="flex flex-row items-center justify-between pb-2">
            <DrawerTitle>Settings</DrawerTitle>
            <button
              type="button"
              onClick={onResync}
              disabled={isResyncing}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card transition hover:bg-surface disabled:opacity-50"
              aria-label="Sync accounts and categories"
            >
              <RefreshCw
                className={`h-4 w-4 ${isResyncing ? "animate-spin" : ""}`}
              />
            </button>
          </DrawerHeader>

          {/* ─────────────────────────────────────────────────────── */}
          {/* Primary tabs: Accounts / Categories */}
          {/* ─────────────────────────────────────────────────────── */}
          <div className="px-4 pb-3">
            <AnimatedTabs
              tabs={SETTINGS_TABS}
              value={activeView}
              onChange={handleViewChange}
              layoutId="settingsTab"
              variant="simple"
            />
          </div>

          {/* ─────────────────────────────────────────────────────── */}
          {/* Secondary tabs for category types */}
          {/* ─────────────────────────────────────────────────────── */}
          {activeView === "categories" && (
            <div className="px-4 pb-3">
              <AnimatedTabs
                tabs={CATEGORY_TYPES.map(({ key, label }) => ({
                  value: key,
                  label,
                }))}
                value={activeCategoryType}
                onChange={(value) => {
                  setActiveCategoryType(value);
                  setIsAddingCategory(false);
                  setNewCategoryName("");
                }}
                layoutId="categoryType"
                variant="pill"
              />
            </div>
          )}

          {/* ─────────────────────────────────────────────────────── */}
          {/* List content */}
          {/* ─────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            {activeView === "accounts" ? (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {accounts.length > 0 ? (
                  accounts.map((account) => (
                    <SwipeableListItem
                      key={account.name}
                      onDelete={() =>
                        removeAccount.mutate({ name: account.name })
                      }
                      disabled={isSaving}
                    >
                      <div className="flex items-center gap-3 bg-card px-4 py-3">
                        {/* Icon button */}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              type: "account",
                              name: account.name,
                              field: "icon",
                            })
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:opacity-80"
                          style={{
                            backgroundColor: `${
                              account.color || DEFAULT_ACCOUNT_COLOR
                            }20`,
                          }}
                        >
                          <DynamicIcon
                            name={account.icon}
                            className="h-5 w-5"
                            style={{
                              color: account.color || DEFAULT_ACCOUNT_COLOR,
                            }}
                          />
                        </button>
                        <span className="flex-1 text-sm font-medium text-foreground">
                          {account.name}
                        </span>
                        {/* Color button */}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              type: "account",
                              name: account.name,
                              field: "color",
                            })
                          }
                          className="h-6 w-6 rounded-full border border-border transition hover:scale-110"
                          style={{
                            backgroundColor:
                              account.color || DEFAULT_ACCOUNT_COLOR,
                          }}
                        />
                      </div>
                    </SwipeableListItem>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No accounts yet
                  </div>
                )}

                {/* Add account row */}
                {isAddingAccount ? (
                  <div className="space-y-3 bg-card p-4">
                    <input
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddAccount();
                        if (e.key === "Escape") {
                          setIsAddingAccount(false);
                          setNewAccountName("");
                        }
                      }}
                      placeholder="Account name"
                      autoFocus
                      disabled={isSaving}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingAccount(false);
                          setNewAccountName("");
                        }}
                        disabled={isSaving}
                        className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAccount}
                        disabled={isSaving}
                        className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingAccount(true)}
                    className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition hover:bg-surface"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <Plus className="h-4 w-4 text-primary" />
                    </span>
                    <span className="text-sm font-medium text-primary">
                      Add Account
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {activeCategories.length > 0 ? (
                  activeCategories.map((category) => (
                    <SwipeableListItem
                      key={category.name}
                      onDelete={() =>
                        removeCategory.mutate({
                          name: category.name,
                          categoryType: activeCategoryType,
                        })
                      }
                      disabled={isSaving}
                    >
                      <div className="flex items-center gap-3 bg-card px-4 py-3">
                        {/* Icon button */}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              type: "category",
                              name: category.name,
                              field: "icon",
                            })
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:opacity-80"
                          style={{
                            backgroundColor: `${
                              category.color ||
                              DEFAULT_CATEGORY_COLORS[activeCategoryType]
                            }20`,
                          }}
                        >
                          <DynamicIcon
                            name={category.icon}
                            fallback={
                              DEFAULT_CATEGORY_ICONS[activeCategoryType]
                            }
                            className="h-5 w-5"
                            style={{
                              color:
                                category.color ||
                                DEFAULT_CATEGORY_COLORS[activeCategoryType],
                            }}
                          />
                        </button>
                        <span className="flex-1 text-sm font-medium text-foreground">
                          {category.name}
                        </span>
                        {/* Color button */}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              type: "category",
                              name: category.name,
                              field: "color",
                            })
                          }
                          className="h-6 w-6 rounded-full border border-border transition hover:scale-110"
                          style={{
                            backgroundColor:
                              category.color ||
                              DEFAULT_CATEGORY_COLORS[activeCategoryType],
                          }}
                        />
                      </div>
                    </SwipeableListItem>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No {activeCategoryType} categories yet
                  </div>
                )}

                {/* Add category row */}
                {isAddingCategory ? (
                  <div className="space-y-3 bg-card p-4">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCategory();
                        if (e.key === "Escape") {
                          setIsAddingCategory(false);
                          setNewCategoryName("");
                        }
                      }}
                      placeholder="Category name"
                      autoFocus
                      disabled={isSaving}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName("");
                        }}
                        disabled={isSaving}
                        className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        disabled={isSaving}
                        className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(true)}
                    className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition hover:bg-surface"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <Plus className="h-4 w-4 text-primary" />
                    </span>
                    <span className="text-sm font-medium text-primary">
                      Add Category
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <button
                type="button"
                className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                Done
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Icon Picker */}
      <IconPicker
        open={editingItem?.field === "icon"}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingItem(null);
        }}
        selected={currentEditItem?.icon}
        onSelect={handleIconSelect}
      />

      {/* Color Picker */}
      <ColorPicker
        open={editingItem?.field === "color"}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingItem(null);
        }}
        selected={currentEditItem?.color}
        onSelect={handleColorSelect}
      />
    </>
  );
}
