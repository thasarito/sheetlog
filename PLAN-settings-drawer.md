# Implementation Plan: Header Settings + Drawer with iOS-Style Swipe List

## Overview

Move account/category management from the inline `AccountCategoryPanel` into a **Settings Drawer** accessible via a gear icon in the Header. The drawer uses an **iOS-style swipe-to-delete list** for a native PWA feel.

---

## Architecture Changes

```
BEFORE:
┌─────────────────────────────────────────┐
│  TransactionFlow                        │
│  ├── AccountCategoryPanel (1fr)         │  ← Contains Header, takes 25% height
│  │   └── Header                         │
│  └── StepCard (3fr)                     │
└─────────────────────────────────────────┘

AFTER:
┌─────────────────────────────────────────┐
│  TransactionFlow                        │
│  ├── Header                             │  ← Extracted, always visible
│  │   └── SettingsDrawer (gear icon)     │  ← New component with swipe list
│  └── StepCard (full height)             │  ← More vertical space
└─────────────────────────────────────────┘
```

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/components/SettingsDrawer.tsx` | **Create** | New drawer with iOS-style swipe list |
| `src/components/SwipeableListItem.tsx` | **Create** | Reusable swipe-to-delete list item |
| `src/components/Header.tsx` | **Modify** | Add gear icon, integrate SettingsDrawer |
| `src/components/TransactionFlow/index.tsx` | **Modify** | Remove AccountCategoryPanel, simplify layout |
| `src/components/TransactionFlow/AccountCategoryPanel.tsx` | **Delete** | Logic moves to SettingsDrawer |

---

## Visual Design: iOS-Style Swipe List

### Drawer Layout

```
┌─────────────────────────────────────────┐
│ ━━━━━━━━━━  (drag handle)               │
│                                         │
│  Settings                          ↻    │  ← Sync button
├─────────────────────────────────────────┤
│                                         │
│  [Accounts]  [Categories]               │  ← Segmented control
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  💳  Cash                       │←───│── swipe left
│  ├─────────────────────────────────┤    │
│  │  🏦  Bank Account               │    │
│  ├─────────────────────────────────┤    │
│  │  💵  Credit Card                │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ＋  Add Account                │    │  ← Tap to expand
│  └─────────────────────────────────┘    │
│                                         │
│                              [Done]     │
└─────────────────────────────────────────┘
```

### Swipe Action States

```
DEFAULT STATE:
┌─────────────────────────────────────────┐
│  💳  Cash                               │
└─────────────────────────────────────────┘

SWIPING LEFT (revealing delete):
┌─────────────────────────────────────────┐
│  💳  Cash                    │ 🗑 Delete │
└─────────────────────────────────────────┘
                               ↑
                         Red background

FULL SWIPE (auto-delete):
┌─────────────────────────────────────────┐
│                              │ 🗑 Delete │ ← Item slides out completely
└─────────────────────────────────────────┘
```

### Add Item Flow (Inline Expansion)

```
COLLAPSED:
┌─────────────────────────────────────────┐
│  ＋  Add Account                        │
└─────────────────────────────────────────┘

EXPANDED (after tap):
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────┐      │
│  │ Account name                  │      │  ← Auto-focused input
│  └───────────────────────────────┘      │
│                                         │
│   [Cancel]                    [Add]     │
└─────────────────────────────────────────┘
```

### Categories View with Type Tabs

```
┌─────────────────────────────────────────┐
│ ━━━━━━━━━━                              │
│  Settings                          ↻    │
├─────────────────────────────────────────┤
│  [Accounts]  [Categories]               │  ← "Categories" selected
├─────────────────────────────────────────┤
│                                         │
│  [Expense]  [Income]  [Transfer]        │  ← Secondary tabs
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🍔  Food                       │←───│
│  ├─────────────────────────────────┤    │
│  │  🚗  Transport                  │    │
│  ├─────────────────────────────────┤    │
│  │  🎬  Entertainment              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ＋  Add Category               │    │
│  └─────────────────────────────────┘    │
│                                         │
│                              [Done]     │
└─────────────────────────────────────────┘
```

---

## Step-by-Step Implementation

### Step 1: Create `SwipeableListItem.tsx`

**Purpose:** Reusable component for swipe-to-delete interaction.

**Dependencies:** `@use-gesture/react` for gesture handling

```tsx
// src/components/SwipeableListItem.tsx

import { useState, useRef } from "react";
import { useDrag } from "@use-gesture/react";
import { animated, useSpring } from "@react-spring/web";
import { Trash2 } from "lucide-react";

type SwipeableListItemProps = {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
};

export function SwipeableListItem({
  children,
  onDelete,
  disabled = false,
}: SwipeableListItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteThreshold = -80; // pixels to reveal delete button
  const fullSwipeThreshold = -150; // pixels for auto-delete

  const [{ x }, api] = useSpring(() => ({ x: 0 }));

  const bind = useDrag(
    ({ down, movement: [mx], cancel }) => {
      if (disabled) return;

      // Only allow left swipe (negative x)
      const clampedX = Math.min(0, mx);

      if (down) {
        api.start({ x: clampedX, immediate: true });
      } else {
        // Released
        if (clampedX < fullSwipeThreshold) {
          // Full swipe - trigger delete
          api.start({ x: -300 });
          setIsDeleting(true);
          setTimeout(onDelete, 200);
        } else if (clampedX < deleteThreshold) {
          // Partial swipe - snap to reveal delete button
          api.start({ x: deleteThreshold });
        } else {
          // Not enough - snap back
          api.start({ x: 0 });
        }
      }
    },
    { axis: "x", from: () => [x.get(), 0] }
  );

  const handleDeleteClick = () => {
    api.start({ x: -300 });
    setIsDeleting(true);
    setTimeout(onDelete, 200);
  };

  const handleTap = () => {
    // If swiped open, close it
    if (x.get() < 0) {
      api.start({ x: 0 });
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete button (behind) */}
      <div className="absolute inset-y-0 right-0 flex items-center">
        <button
          type="button"
          onClick={handleDeleteClick}
          className="flex h-full w-20 items-center justify-center bg-danger text-danger-foreground"
          aria-label="Delete"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Swipeable content (front) */}
      <animated.div
        {...bind()}
        onClick={handleTap}
        style={{ x, touchAction: "pan-y" }}
        className={`relative bg-card ${isDeleting ? "opacity-50" : ""}`}
      >
        {children}
      </animated.div>
    </div>
  );
}
```

**Key Features:**
- Gesture-based swipe using `@use-gesture/react`
- Spring animations with `@react-spring/web`
- Partial swipe reveals delete button
- Full swipe auto-deletes
- Tap to dismiss revealed button
- Haptic feedback ready

---

### Step 2: Create `SettingsDrawer.tsx`

**Purpose:** Main drawer component containing all account/category management.

```tsx
// src/components/SettingsDrawer.tsx

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
import { SwipeableListItem } from "./SwipeableListItem";
import { useOnboarding } from "./providers";
import type { TransactionType } from "../lib/types";

type SettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResync: () => void;
  isResyncing: boolean;
  onToast: (message: string) => void;
};

type ActiveView = "accounts" | "categories";

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
  const { onboarding, updateOnboarding } = useOnboarding();
  const [activeView, setActiveView] = useState<ActiveView>("accounts");
  const [activeCategoryType, setActiveCategoryType] = useState<TransactionType>("expense");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const accounts = onboarding.accounts ?? [];
  const categories = onboarding.categories ?? { expense: [], income: [], transfer: [] };
  const activeCategories = categories[activeCategoryType] ?? [];

  // ─────────────────────────────────────────────────────────────
  // Account handlers
  // ─────────────────────────────────────────────────────────────

  async function addAccount() {
    const trimmed = newAccountName.trim();
    if (!trimmed) {
      onToast("Enter an account name");
      return;
    }
    if (accounts.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      onToast("Account already exists");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({
        accounts: [...accounts, trimmed],
        accountsConfirmed: true,
      });
      setNewAccountName("");
      setIsAddingAccount(false);
    } catch {
      onToast("Failed to add account");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAccount(name: string) {
    setIsSaving(true);
    try {
      await updateOnboarding({
        accounts: accounts.filter((a) => a !== name),
        accountsConfirmed: true,
      });
      onToast("Account removed");
    } catch {
      onToast("Failed to remove account");
    } finally {
      setIsSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Category handlers
  // ─────────────────────────────────────────────────────────────

  async function addCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      onToast("Enter a category name");
      return;
    }
    const list = categories[activeCategoryType] ?? [];
    if (list.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      onToast("Category already exists");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({
        categories: {
          ...categories,
          [activeCategoryType]: [...list, trimmed],
        },
        categoriesConfirmed: true,
      });
      setNewCategoryName("");
      setIsAddingCategory(false);
    } catch {
      onToast("Failed to add category");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCategory(name: string) {
    setIsSaving(true);
    try {
      await updateOnboarding({
        categories: {
          ...categories,
          [activeCategoryType]: activeCategories.filter((c) => c !== name),
        },
        categoriesConfirmed: true,
      });
      onToast("Category removed");
    } catch {
      onToast("Failed to remove category");
    } finally {
      setIsSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>Settings</DrawerTitle>
          <button
            type="button"
            onClick={onResync}
            disabled={isResyncing}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card transition hover:bg-surface disabled:opacity-50"
            aria-label="Sync accounts and categories"
          >
            <RefreshCw className={`h-4 w-4 ${isResyncing ? "animate-spin" : ""}`} />
          </button>
        </DrawerHeader>

        {/* ─────────────────────────────────────────────────────── */}
        {/* Primary tabs: Accounts / Categories */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="px-4 pb-3">
          <div className="flex rounded-xl bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setActiveView("accounts")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                activeView === "accounts"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Accounts
            </button>
            <button
              type="button"
              onClick={() => setActiveView("categories")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                activeView === "categories"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Categories
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* Secondary tabs for category types */}
        {/* ─────────────────────────────────────────────────────── */}
        {activeView === "categories" && (
          <div className="px-4 pb-3">
            <div className="flex gap-2">
              {CATEGORY_TYPES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveCategoryType(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeCategoryType === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────── */}
        {/* List content */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4">
          {activeView === "accounts" ? (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <SwipeableListItem
                    key={account}
                    onDelete={() => removeAccount(account)}
                    disabled={isSaving}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-lg">💳</span>
                      <span className="text-sm font-medium text-foreground">
                        {account}
                      </span>
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
                <div className="space-y-3 p-4">
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addAccount()}
                    placeholder="Account name"
                    autoFocus
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingAccount(false);
                        setNewAccountName("");
                      }}
                      className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addAccount}
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
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface"
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
                    key={category}
                    onDelete={() => removeCategory(category)}
                    disabled={isSaving}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-lg">🏷️</span>
                      <span className="text-sm font-medium text-foreground">
                        {category}
                      </span>
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
                <div className="space-y-3 p-4">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCategory()}
                    placeholder="Category name"
                    autoFocus
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCategory(false);
                        setNewCategoryName("");
                      }}
                      className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addCategory}
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
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface"
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
  );
}
```

---

### Step 3: Update `Header.tsx`

**Changes:**
- Add Settings (gear) icon
- Accept props for drawer control
- Conditionally render settings button

```tsx
// src/components/Header.tsx

import { useState } from "react";
import { Settings } from "lucide-react";
import { AuthUserProfile } from "./AuthUserProfile";
import { SettingsDrawer } from "./SettingsDrawer";

type HeaderProps = {
  showSettings?: boolean;
  onResync?: () => void;
  isResyncing?: boolean;
  onToast?: (message: string) => void;
};

export function Header({
  showSettings = false,
  onResync,
  isResyncing = false,
  onToast,
}: HeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3">
      {/* Logo and brand name */}
      <div className="flex items-center gap-2">
        <img src="/icon.svg" alt="Sheetlog logo" className="w-8 h-8" />
        <span className="text-lg font-semibold text-foreground">Sheetlog</span>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {showSettings && (
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-surface"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        <AuthUserProfile compact />
      </div>

      {/* Settings Drawer */}
      {showSettings && onResync && onToast && (
        <SettingsDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          onResync={onResync}
          isResyncing={isResyncing}
          onToast={onToast}
        />
      )}
    </header>
  );
}
```

---

### Step 4: Update `TransactionFlow/index.tsx`

**Changes:**
- Remove `AccountCategoryPanel` import and grid layout
- Add Header with settings props at top level
- StepCard takes full remaining height

```tsx
// Key changes to src/components/TransactionFlow/index.tsx

// REMOVE this import:
// import { AccountCategoryPanel } from "./AccountCategoryPanel";

// CHANGE the return statement (around line 414-451):

return (
  <main className="h-full from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6">
    <ServiceWorker />
    {isOnboarded ? (
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {/* Header with settings drawer */}
        <Header
          showSettings
          onResync={() => void handleResync()}
          isResyncing={isResyncing}
          onToast={handleToast}
        />

        {/* Main content - full height */}
        <div className="flex-1 min-h-0 px-0 pb-6">
          <StepCard
            animationKey={activeStep.key}
            className={activeStep.className}
            containerClassName="h-full"
          >
            {activeStep.content}
          </StepCard>
        </div>
      </div>
    ) : (
      <OnboardingFlow onToast={handleToast} />
    )}
  </main>
);
```

---

### Step 5: Install Dependencies

```bash
# For swipe gestures
npm install @use-gesture/react

# For spring animations (smooth swipe)
npm install @react-spring/web
```

---

### Step 6: Delete `AccountCategoryPanel.tsx`

After confirming everything works, remove the old file:

```bash
rm src/components/TransactionFlow/AccountCategoryPanel.tsx
```

---

## Swipe Gesture Configuration

### Gesture Thresholds

| Threshold | Value | Behavior |
|-----------|-------|----------|
| `deleteThreshold` | -80px | Reveals delete button |
| `fullSwipeThreshold` | -150px | Auto-triggers delete |
| `snapBack` | 0px | Returns to closed state |

### Animation Config

```tsx
// Spring configuration for native feel
const springConfig = {
  tension: 300,
  friction: 30,
};
```

### Haptic Feedback (Optional)

```tsx
// Add to SwipeableListItem for native feel
function triggerHaptic() {
  if ("vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

// Call when delete is revealed or triggered
if (clampedX < deleteThreshold) {
  triggerHaptic();
}
```

---

## UX Enhancements

| Enhancement | Implementation |
|-------------|----------------|
| **Undo toast** | Show "Account removed. Undo?" toast with action button |
| **Empty states** | Friendly message when no accounts/categories exist |
| **Loading states** | Disable interactions while saving |
| **Keyboard support** | Enter to submit, Escape to cancel |
| **Safe areas** | Add `pb-safe` for iOS home indicator |
| **Reduced motion** | Respect `prefers-reduced-motion` for animations |

---

## Testing Checklist

### Header
- [ ] Gear icon appears when logged in
- [ ] Gear icon has hover/active states
- [ ] Clicking gear opens drawer

### Drawer
- [ ] Opens with smooth animation
- [ ] Closes on backdrop tap
- [ ] Closes on drag down
- [ ] Closes on "Done" button
- [ ] Sync button triggers refresh
- [ ] Sync button shows spinner while syncing

### Accounts Tab
- [ ] Lists all accounts
- [ ] Swipe left reveals delete button
- [ ] Tap delete removes account
- [ ] Full swipe auto-deletes
- [ ] Tap closed row when delete is open closes it
- [ ] "Add Account" expands to input
- [ ] Can add new account
- [ ] Duplicate account shows error toast
- [ ] Empty name shows error toast
- [ ] Cancel closes add form

### Categories Tab
- [ ] Lists categories for selected type
- [ ] Type tabs switch category lists
- [ ] Swipe/delete works same as accounts
- [ ] Add category works same as accounts

### Integration
- [ ] Main transaction flow has more vertical space
- [ ] All steps render correctly
- [ ] No layout shift when switching steps

### Mobile/PWA
- [ ] Works on iOS Safari
- [ ] Works on Android Chrome
- [ ] Respects safe areas
- [ ] Touch gestures feel native
- [ ] No scroll interference with swipe

---

## Rollback Plan

If issues arise, the changes can be reverted by:

1. Restore `AccountCategoryPanel.tsx` from git
2. Revert `Header.tsx` changes
3. Revert `TransactionFlow/index.tsx` changes
4. Delete new files (`SettingsDrawer.tsx`, `SwipeableListItem.tsx`)

---

## Future Enhancements

| Feature | Description |
|---------|-------------|
| **Reordering** | Drag handle to reorder accounts/categories |
| **Icons** | Custom emoji/icon picker for categories |
| **Color coding** | Assign colors to categories |
| **Bulk edit** | Select multiple items to delete |
| **Search** | Filter long category lists |
| **Import/Export** | Backup/restore settings |
