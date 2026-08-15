import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { parseDate } from "../../lib/date-utils";
import { useConnectivity, useTransactions } from "../../app/providers";
import { useOnboarding } from "../../hooks/useOnboarding";
import { Header } from "../Header";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import { STORAGE_KEYS } from "../../lib/constants";
import { db } from "../../lib/db";
import type { TransactionType, CategoryItem, TransactionRecord } from "../../lib/types";
import { StepCard } from "./StepCard";
import { StepAmount } from "./StepAmount";
import { StepCategory } from "./StepCategory";
import { StepReceipt, type ReceiptData } from "./StepReceipt";
import { FOR_OPTIONS, TYPE_OPTIONS } from "./constants";
import { toast } from "sonner";
import { useTransactionForm } from "./useTransactionForm";
import { useAddTransactionMutation } from "./useAddTransactionMutation";
import {
  transactionSchema,
  type TransactionFormValues,
} from "./transactionSchema";
import { TopDashboard } from "./TopDashboard";
import { CategoryGridDrawer } from "../CategoryGridDrawer";
import { DateTimeDrawer } from "../DateTimeDrawer";
import { useUpdateTransactionMutation } from "./useUpdateTransactionMutation";
import { useDeleteTransactionMutation } from "./useDeleteTransactionMutation";
import { useNearbyPlaceSuggestions } from "./useNearbyPlaceSuggestions";
import { hasGoogleMapsApiKey, type PlaceSuggestion } from "../../lib/googlePlaces";
import { PlaceSearchDrawer } from "./PlaceSearchDrawer";
import { usePlaceAutocomplete } from "./usePlaceAutocomplete";
import { isPlacesEligible, type PlacesFlowMode } from "./placesEligibility";

type ToastAction = { label: string; onClick: () => void };
type StepDefinition = {
  key: string;
  label: string;
  className: string;
  content: React.ReactNode;
};

function createPlaceSessionId() {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(
    8,
    12
  )}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(
    16,
    20
  )}-${hexadecimal.slice(20)}`;
}

export function TransactionFlow() {
  const { undoLast, lastSyncError, lastSyncErrorAt } = useTransactions();
  const { onboarding, refreshOnboarding } = useOnboarding();
  const { isOnline } = useConnectivity();
  const [isResyncing, setIsResyncing] = useState(false);
  const [step, setStep] = useState(0);
  const [placeSuggestionSessionId, setPlaceSuggestionSessionId] = useState(
    createPlaceSessionId
  );
  const [placeSearchSessionId, setPlaceSearchSessionId] = useState(
    createPlaceSessionId
  );
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [dateDrawerOpen, setDateDrawerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const placeSearchButtonRef = useRef<HTMLButtonElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const mutation = useAddTransactionMutation();
  const updateMutation = useUpdateTransactionMutation();
  const deleteMutation = useDeleteTransactionMutation();
  const form = useTransactionForm({
    onSubmit: async (values) => {
      await handleSubmit(values);
    },
  });
  const {
    type,
    category,
    amount,
    currency,
    account,
    forValue,
    dateObject,
    note,
  } = form.useStore((state) => state.values);
  const placesMode: PlacesFlowMode = editingTransaction ? "edit" : "create";
  const shouldFetchNearbyPlaces = isPlacesEligible({
    step,
    type,
    mode: placesMode,
    hasReceipt: step === 2 || receiptData !== null,
  });
  const canSearchPlaces =
    shouldFetchNearbyPlaces && isOnline && hasGoogleMapsApiKey();
  const nearbyPlaces = useNearbyPlaceSuggestions({
    enabled: shouldFetchNearbyPlaces,
    isOnline,
    sessionId: placeSuggestionSessionId,
  });
  const placeAutocomplete = usePlaceAutocomplete({
    open: placeSearchOpen,
    enabled: canSearchPlaces,
    sessionId: placeSearchSessionId,
    locationBias: nearbyPlaces.coordinates,
  });
  const receiptTimeoutRef = useRef<number | null>(null);
  const lastSyncErrorRef = useRef<string | null>(null);

  const restorePlacePickerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const searchButton = placeSearchButtonRef.current;
      if (searchButton?.isConnected) {
        searchButton.focus();
        return;
      }
      noteInputRef.current?.focus();
    });
  }, []);

  const closePlaceSearch = useCallback(() => {
    setPlaceSearchOpen(false);
    restorePlacePickerFocus();
  }, [restorePlacePickerFocus]);

  const openPlaceSearch = useCallback(() => {
    if (!canSearchPlaces) {
      return;
    }
    setPlaceSearchSessionId(createPlaceSessionId());
    setPlaceSearchOpen(true);
  }, [canSearchPlaces]);

  const handlePlaceSearchOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        openPlaceSearch();
        return;
      }
      closePlaceSearch();
    },
    [closePlaceSearch, openPlaceSearch]
  );

  const handlePlaceSuggestionSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      try {
        const displayName = await placeAutocomplete.selectSuggestion(suggestion);
        form.setFieldValue("note", displayName);
        closePlaceSearch();
      } catch {
        // The autocomplete hook keeps selection errors inline in the drawer.
      }
    },
    [closePlaceSearch, form, placeAutocomplete.selectSuggestion]
  );

  const categories = onboarding.categories ?? DEFAULT_CATEGORIES;

  const categoryGroups = useMemo(() => {
    return TYPE_OPTIONS.reduce((acc, typeOption) => {
      const typeCategories = categories[typeOption] ?? [];
      acc[typeOption] = typeCategories;
      return acc;
    }, {} as Record<TransactionType, CategoryItem[]>);
  }, [categories]);

  useEffect(() => {
    return () => {
      if (receiptTimeoutRef.current) {
        window.clearTimeout(receiptTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (placeSearchOpen && !canSearchPlaces) {
      closePlaceSearch();
    }
  }, [canSearchPlaces, closePlaceSearch, placeSearchOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (account) {
      window.localStorage.setItem(STORAGE_KEYS.LAST_ACCOUNT, account);
      return;
    }
    // Try to restore last account if none selected
    const lastAccount = window.localStorage.getItem(STORAGE_KEYS.LAST_ACCOUNT);
    if (
      lastAccount &&
      onboarding.accounts.some((a) => a.name === lastAccount)
    ) {
      form.setFieldValue("account", lastAccount);
      return;
    }
    // Default to first account if only one exists
    if (onboarding.accounts.length === 1) {
      form.setFieldValue("account", onboarding.accounts[0].name);
    }
  }, [account, form, onboarding.accounts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    // Always update global fallback
    window.localStorage.setItem(STORAGE_KEYS.LAST_CURRENCY, currency);

    // Update per-account currency
    if (account) {
      window.localStorage.setItem(
        `${STORAGE_KEYS.LAST_CURRENCY}_${account}`,
        currency
      );
    }
  }, [currency, account]);

  // Restore currency when account changes
  useEffect(() => {
    if (typeof window === "undefined" || !account) {
      return;
    }
    const lastCurrencyForAccount = window.localStorage.getItem(
      `${STORAGE_KEYS.LAST_CURRENCY}_${account}`
    );
    if (lastCurrencyForAccount) {
      form.setFieldValue("currency", lastCurrencyForAccount);
    }
  }, [account, form]);

  useEffect(() => {
    if (type === "transfer" && forValue) {
      const isAccountValue = onboarding.accounts.some(
        (a) => a.name === forValue
      );
      if (!isAccountValue) {
        form.setFieldValue("forValue", "");
      }
    }
  }, [type, forValue, form, onboarding.accounts]);

  useEffect(() => {
    if (type === "transfer" && account && forValue === account) {
      form.setFieldValue("forValue", "");
    }
  }, [type, account, forValue, form]);

  useEffect(() => {
    if (type === "transfer") {
      return;
    }
    if (!forValue || !FOR_OPTIONS.includes(forValue)) {
      form.setFieldValue("forValue", "Me");
    }
  }, [type, forValue, form]);

  const handleToast = useCallback((message: string, action?: ToastAction) => {
    if (action) {
      toast(message, {
        action: {
          label: action.label,
          onClick: action.onClick,
        },
      });
      return;
    }
    toast(message);
  }, []);

  function handleFormSubmit() {
    const result = transactionSchema.safeParse({
      type,
      category,
      amount,
      currency,
      account,
      forValue,
      dateObject,
      note,
    });
    if (!result.success) {
      handleToast(result.error.issues[0]?.message ?? "Complete all fields");
      return;
    }
    void form.handleSubmit();
  }

  useEffect(() => {
    if (!lastSyncError || !lastSyncErrorAt) {
      return;
    }
    if (lastSyncErrorAt === lastSyncErrorRef.current) {
      return;
    }
    lastSyncErrorRef.current = lastSyncErrorAt;
    handleToast(lastSyncError);
  }, [handleToast, lastSyncError, lastSyncErrorAt]);

  function scheduleReceiptTransition(callback: () => void, delay: number) {
    if (receiptTimeoutRef.current) {
      window.clearTimeout(receiptTimeoutRef.current);
    }
    receiptTimeoutRef.current = window.setTimeout(callback, delay);
  }

  function clearReceiptTransition() {
    if (receiptTimeoutRef.current) {
      window.clearTimeout(receiptTimeoutRef.current);
      receiptTimeoutRef.current = null;
    }
  }

  async function handleResync() {
    if (isResyncing) {
      return;
    }
    if (!isOnline) {
      handleToast("Go online to sync accounts and categories");
      return;
    }
    setIsResyncing(true);
    try {
      const changed = await refreshOnboarding();
      handleToast(
        changed
          ? "Accounts and categories refreshed"
          : "Accounts and categories are up to date"
      );
    } catch (error) {
      handleToast(
        error instanceof Error
          ? error.message
          : "Failed to sync accounts and categories"
      );
    } finally {
      setIsResyncing(false);
    }
  }

  const resetFlow = useCallback(() => {
    setStep(0);
    setPlaceSearchOpen(false);
    setPlaceSuggestionSessionId(createPlaceSessionId());
    setPlaceSearchSessionId(createPlaceSessionId());
    setReceiptData(null);
    setEditingTransaction(null);
    setShowDeleteConfirm(false);
    mutation.reset();
    updateMutation.reset();
    form.setFieldValue("type", TYPE_OPTIONS[0]);
    form.setFieldValue("category", "");
    form.setFieldValue("amount", "");
    form.setFieldValue("forValue", "Me");
    form.setFieldValue("note", "");
    form.setFieldValue("dateObject", new Date());
  }, [mutation, updateMutation, form]);

  const openCreateAmountStep = useCallback(() => {
    setPlaceSuggestionSessionId(createPlaceSessionId());
    setStep(1);
  }, []);

  const handleEditTransaction = useCallback(async (t: TransactionRecord) => {
    // Ensure transaction exists in IndexedDB for update/delete to work
    // (Recent transactions come from Google Sheets, not IndexedDB)
    const existingTx = await db.transactions.get(t.id);
    if (!existingTx) {
      await db.transactions.put(t);
    }

    form.setFieldValue("type", t.type);
    form.setFieldValue("category", t.category);
    form.setFieldValue("amount", String(t.amount));
    form.setFieldValue("currency", t.currency);
    form.setFieldValue("account", t.account);
    form.setFieldValue("forValue", t.for);
    form.setFieldValue("dateObject", parseDate(t.date));
    form.setFieldValue("note", t.note ?? "");
    setEditingTransaction(t);
    setStep(1);
  }, [form]);

  const handleDelete = useCallback(() => {
    if (!editingTransaction) return;
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      toast("Tap delete again to confirm", {
        duration: 3000,
        onAutoClose: () => setShowDeleteConfirm(false),
      });
      return;
    }
    deleteMutation.mutate(editingTransaction.id, {
      onSuccess: () => {
        resetFlow();
      },
      onError: () => {
        toast.error("Failed to delete transaction");
      },
    });
  }, [editingTransaction, showDeleteConfirm, deleteMutation, resetFlow]);

  function clearReceiptStep() {
    setStep(0);
    setReceiptData(null);
    setEditingTransaction(null);
    mutation.reset();
    updateMutation.reset();
  }

  function handleReceiptDone() {
    clearReceiptTransition();
    resetFlow();
  }

  async function handleReceiptUndo() {
    clearReceiptTransition();
    await handleUndo();
    resetFlow();
  }

  async function handleUndo() {
    const result = await undoLast();
    handleToast(result.message);
  }

  async function handleSubmit(values: TransactionFormValues) {
    if (mutation.isPending || updateMutation.isPending) {
      return;
    }
    if (!values.type || !values.category || !values.amount) {
      handleToast("Complete all fields");
      return;
    }
    const parsedAmount = Number.parseFloat(values.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      handleToast("Enter a valid amount");
      return;
    }
    if (!values.account) {
      handleToast("Select an account");
      return;
    }
    const trimmedFor = values.forValue.trim();
    const trimmedNote = values.note.trim();
    if (values.type === "transfer") {
      if (onboarding.accounts.length < 2) {
        handleToast("Add another account to log transfers");
        return;
      }
      if (!trimmedFor) {
        handleToast("Select a destination account");
        return;
      }
      if (trimmedFor === values.account) {
        handleToast("Pick two different accounts");
        return;
      }
    }
    const resolvedFor = trimmedFor || values.forValue;

    // Handle update mode
    if (editingTransaction) {
      const nextReceipt: ReceiptData = {
        type: values.type,
        category: values.category,
        amount: values.amount,
        currency: values.currency,
        account: values.account,
        forValue: resolvedFor,
        dateObject: values.dateObject,
        note: trimmedNote,
      };
      setReceiptData(nextReceipt);
      setStep(2);
      try {
        await updateMutation.mutateAsync({
          id: editingTransaction.id,
          input: {
            type: values.type,
            category: values.category,
            amount: parsedAmount,
            currency: values.currency,
            account: values.account,
            for: resolvedFor,
            date: format(values.dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
            note: trimmedNote || undefined,
          },
        });
        scheduleReceiptTransition(() => resetFlow(), 2000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update transaction";
        handleToast(message);
        scheduleReceiptTransition(() => clearReceiptStep(), 2000);
      }
      return;
    }

    // Handle create mode
    const nextReceipt: ReceiptData = {
      type: values.type,
      category: values.category,
      amount: values.amount,
      currency: values.currency,
      account: values.account,
      forValue: resolvedFor,
      dateObject: values.dateObject,
      note: trimmedNote,
    };
    setReceiptData(nextReceipt);
    setStep(2);
    try {
      await mutation.mutateAsync({
        ...values,
        forValue: resolvedFor,
        note: trimmedNote,
      });
      scheduleReceiptTransition(() => resetFlow(), 2000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save transaction";
      handleToast(message);
      scheduleReceiptTransition(() => {
        clearReceiptStep();
      }, 2000);
    }
  }

  const receiptSnapshot: ReceiptData = receiptData ?? {
    type: type ?? TYPE_OPTIONS[0],
    category: category ?? "",
    amount,
    currency,
    account: account ?? "",
    forValue,
    dateObject,
    note,
  };

  const steps: StepDefinition[] = [
    {
      key: "step-type-category",
      label: "Type & category",
      className: "h-full min-h-0",
      content: (
        <StepCategory
          form={form}
          categoryGroups={categoryGroups}
          onConfirm={openCreateAmountStep}
        />
      ),
    },
    {
      key: "step-amount",
      label: "Amount",
      className: "space-y-5 h-full",
      content: (
        <StepAmount
          form={form}
          accounts={onboarding.accounts.map((a) => a.name)}
          onBack={() => {
            if (editingTransaction) {
              setEditingTransaction(null);
              setShowDeleteConfirm(false);
            }
            setStep(0);
          }}
          onSubmit={handleFormSubmit}
          isSubmitting={mutation.isPending || updateMutation.isPending}
          onDelete={editingTransaction ? handleDelete : undefined}
          isDeleting={deleteMutation.isPending}
          onCategoryClick={editingTransaction ? () => setCategoryDrawerOpen(true) : undefined}
          onDateClick={editingTransaction ? () => setDateDrawerOpen(true) : undefined}
          submitLabel={editingTransaction ? "Save" : undefined}
          nearbyPlaceSuggestions={
            shouldFetchNearbyPlaces ? nearbyPlaces.suggestions : []
          }
          isNearbyPlacesLoading={
            shouldFetchNearbyPlaces ? nearbyPlaces.isLoading : false
          }
          onNearbyPlaceSelect={
            shouldFetchNearbyPlaces
              ? (suggestion) => form.setFieldValue("note", suggestion.name)
              : undefined
          }
          canSearchPlaces={canSearchPlaces}
          onSearchPlaces={canSearchPlaces ? openPlaceSearch : undefined}
          searchButtonRef={placeSearchButtonRef}
          noteInputRef={noteInputRef}
        />
      ),
    },
    {
      key: "step-receipt",
      label: "Receipt",
      className: "space-y-6 h-full",
      content: (() => {
        const activeMutation = editingTransaction ? updateMutation : mutation;
        return (
          <StepReceipt
            {...receiptSnapshot}
            isPending={activeMutation.isPending}
            isSuccess={activeMutation.isSuccess}
            isError={activeMutation.isError}
            errorMessage={
              activeMutation.error instanceof Error
                ? activeMutation.error.message
                : activeMutation.isError
                ? "Failed to save transaction"
                : undefined
            }
            onDone={handleReceiptDone}
            onUndo={editingTransaction ? undefined : handleReceiptUndo}
          />
        );
      })(),
    },
  ];

  const activeStep = steps[step] ?? steps[0];

  return (
    <main className="h-dvh from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6">
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {/* Header with settings drawer */}
        <Header
          showSettings
          onResync={() => void handleResync()}
          isResyncing={isResyncing}
          onToast={handleToast}
        />

        {/* Main content - full height */}
        <div className="flex-1 min-h-0 pb-6">
          {step === 0 ? (
            <div className="grid h-full grid-rows-[1fr_3fr] gap-4">
              <div className="min-h-0">
                <TopDashboard onEditTransaction={handleEditTransaction} />
              </div>
              <div className="min-h-0">
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
            <StepCard
              animationKey={activeStep.key}
              className={activeStep.className}
              containerClassName="h-full"
            >
              {activeStep.content}
            </StepCard>
          )}
        </div>
      </div>

      {editingTransaction && (
        <>
          <DateTimeDrawer
            value={dateObject}
            onChange={(date) => form.setFieldValue("dateObject", date)}
            open={dateDrawerOpen}
            onOpenChange={setDateDrawerOpen}
            showTrigger={false}
          />
          <CategoryGridDrawer
            type={type}
            onTypeChange={(newType) => {
              form.setFieldValue("type", newType);
              form.setFieldValue("category", "");
            }}
            categories={categoryGroups[type] ?? []}
            onSelect={(cat) => {
              form.setFieldValue("category", cat);
              setCategoryDrawerOpen(false);
            }}
            open={categoryDrawerOpen}
            onOpenChange={setCategoryDrawerOpen}
            layoutId="editTransactionCategory"
          />
        </>
      )}

      <PlaceSearchDrawer
        open={placeSearchOpen}
        onOpenChange={handlePlaceSearchOpenChange}
        input={placeAutocomplete.input}
        onInputChange={placeAutocomplete.setInput}
        suggestions={placeAutocomplete.suggestions}
        isLoading={placeAutocomplete.isLoading}
        isError={placeAutocomplete.isError}
        error={placeAutocomplete.error}
        selectionError={placeAutocomplete.selectionError}
        isSelecting={placeAutocomplete.isSelecting}
        onRetry={() => void placeAutocomplete.retry()}
        onSelect={(suggestion) => void handlePlaceSuggestionSelect(suggestion)}
      />
    </main>
  );
}
