import { format } from "date-fns";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CURRENCIES } from "../../lib/currencies";
import type {
  CategoryItem,
  TransactionRecord,
  TransactionType,
} from "../../lib/types";
import { cn } from "../../lib/utils";
import { CategoryGridDrawer } from "../CategoryGridDrawer";
import { DateTimeDrawer } from "../DateTimeDrawer";
import { Keypad } from "../Keypad";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import { InlinePicker } from "../ui/inline-picker";
import { FOR_OPTIONS } from "./constants";
import { useDeleteTransactionMutation } from "./useDeleteTransactionMutation";
import { useUpdateTransactionMutation } from "./useUpdateTransactionMutation";
import { useOnboardingQuery } from "../../hooks/useOnboardingQuery";

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

type TransactionEditDrawerProps = {
  transaction: TransactionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TransactionEditDrawer({
  transaction,
  open,
  onOpenChange,
}: TransactionEditDrawerProps) {
  const { data: onboarding } = useOnboardingQuery();
  const updateMutation = useUpdateTransactionMutation();
  const deleteMutation = useDeleteTransactionMutation();

  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("THB");
  const [account, setAccount] = useState("");
  const [forValue, setForValue] = useState("");
  const [dateObject, setDateObject] = useState(new Date());
  const [note, setNote] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dateDrawerOpen, setDateDrawerOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  const accounts = useMemo(
    () => onboarding?.accounts.map((a) => a.name) ?? [],
    [onboarding]
  );

  const categoryItems = useMemo<CategoryItem[]>(() => {
    if (!onboarding?.categories) return [];
    return onboarding.categories[type] ?? [];
  }, [onboarding, type]);

  const isTransfer = type === "transfer";
  const toAccountOptions = useMemo(() => {
    if (!isTransfer) return [];
    return accounts.filter((a) => a !== account);
  }, [isTransfer, accounts, account]);

  const isValid = useMemo(() => {
    const numAmount = Number.parseFloat(amount);
    if (!amount || Number.isNaN(numAmount) || numAmount <= 0) return false;
    if (!category) return false;
    if (!account) return false;
    if (isTransfer && (!forValue || forValue === account)) return false;
    return true;
  }, [amount, category, account, isTransfer, forValue]);

  // Track previous open state to detect drawer open transitions
  const prevOpenRef = useRef(open);

  // Only reset form when drawer transitions from closed to open
  useEffect(() => {
    if (open && !prevOpenRef.current && transaction) {
      setType(transaction.type);
      setCategory(transaction.category);
      setAmount(String(transaction.amount));
      setCurrency(transaction.currency);
      setAccount(transaction.account);
      setForValue(transaction.for);
      setDateObject(new Date(transaction.date));
      setNote(transaction.note ?? "");
      setShowDeleteConfirm(false);
    }
    prevOpenRef.current = open;
  }, [open, transaction]);

  const handleSave = useCallback(() => {
    if (!transaction) return;

    updateMutation.mutate(
      {
        id: transaction.id,
        input: {
          type,
          category,
          amount: Number.parseFloat(amount),
          currency,
          account,
          for: forValue,
          date: format(dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
          note: note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: () => {
          toast.error("Failed to update transaction");
        },
      }
    );
  }, [
    transaction,
    type,
    category,
    amount,
    currency,
    account,
    forValue,
    dateObject,
    note,
    updateMutation,
    onOpenChange,
  ]);

  const handleDelete = useCallback(() => {
    if (!transaction) return;

    deleteMutation.mutate(transaction.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
      onError: () => {
        toast.error("Failed to delete transaction");
      },
    });
  }, [transaction, deleteMutation, onOpenChange]);

  const isSubmitting = updateMutation.isPending || deleteMutation.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit Transaction</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Header: Category & DateTime */}
          <div className="flex items-center gap-3 border-b border-border/20 pb-3">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors disabled:opacity-60"
              onClick={() => setCategoryDrawerOpen(true)}
              disabled={isSubmitting}
            >
              {TYPE_LABELS[type]}: {category || "Select"}
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              type="button"
              className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors tabular-nums disabled:opacity-60"
              onClick={() => setDateDrawerOpen(true)}
              disabled={isSubmitting}
            >
              {format(dateObject, "dd MMM · HH:mm")}
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Amount Display */}
          <div className="flex items-center justify-between py-3 text-4xl font-semibold text-foreground">
            <span className="tabular-nums">{amount || "0"}</span>
            <div className="w-24">
              <InlinePicker
                label="Currency"
                labelHidden
                value={currency}
                options={CURRENCIES}
                onChange={setCurrency}
                itemHeight={24}
                visibleItems={3}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Account and For/To */}
          <div className="grid grid-cols-2 gap-3">
            <InlinePicker
              label={isTransfer ? "From" : "Account"}
              value={account}
              options={accounts}
              onChange={setAccount}
              disabled={isSubmitting}
            />
            {isTransfer ? (
              <InlinePicker
                label="To"
                value={forValue}
                options={toAccountOptions}
                onChange={setForValue}
                disabled={isSubmitting}
              />
            ) : (
              <InlinePicker
                label="For"
                value={forValue}
                options={FOR_OPTIONS}
                onChange={setForValue}
                disabled={isSubmitting}
              />
            )}
          </div>

          {/* Note */}
          <div className="flex items-center gap-3 border-b border-border/10 pb-2">
            <FileText className="h-4 w-4 text-muted-foreground/50" />
            <input
              type="text"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-60"
              placeholder="Add a note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </div>

          {/* Keypad */}
          <Keypad value={amount} onChange={setAmount} />
        </div>

        <DrawerFooter className="flex-row gap-2 px-4 pb-6">
          {showDeleteConfirm ? (
            <>
              <button
                type="button"
                className="flex-1 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl bg-destructive py-3 text-sm font-semibold text-destructive-foreground"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive",
                  isSubmitting && "opacity-60"
                )}
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSubmitting}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </DrawerClose>
              <button
                type="button"
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                onClick={handleSave}
                disabled={!isValid || isSubmitting}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </DrawerFooter>

        <DateTimeDrawer
          value={dateObject}
          onChange={setDateObject}
          open={dateDrawerOpen}
          onOpenChange={setDateDrawerOpen}
          showTrigger={false}
        />

        <CategoryGridDrawer
          type={type}
          onTypeChange={(value) => {
            setType(value);
            setCategory("");
          }}
          categories={categoryItems}
          onSelect={setCategory}
          open={categoryDrawerOpen}
          onOpenChange={setCategoryDrawerOpen}
          layoutId="editTransactionTypeDrawer"
        />
      </DrawerContent>
    </Drawer>
  );
}
