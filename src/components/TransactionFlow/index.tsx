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
import {
  getReimbursementFormDefaults,
  reimbursementFieldsLocked,
  type TransactionFlowMode,
} from "./flowMode";
import {
  buildReimbursementInput,
  ReimbursementRecordError,
  useCreateReimbursementMutation,
} from "./useCreateReimbursementMutation";
import { useReimbursementSummary } from "./useReimbursementSummary";
import { ReimbursementAction } from "./ReimbursementAction";
import {
  isReimbursableExpense,
  REIMBURSEMENT_CATEGORY,
} from "../../lib/reimbursements";
import { createFlowGeneration } from "./flowGeneration";

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

function editFlowKey(transactionId: string) {
  return `edit:${transactionId}`;
}

function reimbursementFlowKey(sourceId: string) {
  return `reimburse:${sourceId}`;
}

function receiptFlowKey(transactionId: string) {
  return `receipt:${transactionId}`;
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
  const [flowMode, setFlowMode] = useState<TransactionFlowMode>({
    kind: "create",
  });
  const [createdReimbursement, setCreatedReimbursement] =
    useState<TransactionRecord | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [dateDrawerOpen, setDateDrawerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [flowGeneration] = useState(() =>
    createFlowGeneration("dashboard"),
  );
  const placeSearchButtonRef = useRef<HTMLButtonElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const placeSearchGenerationRef = useRef(0);
  const activePlaceSearchSessionRef = useRef<string | null>(null);
  const placeSearchOpenRef = useRef(false);
  const canSearchPlacesRef = useRef(false);
  const mutation = useAddTransactionMutation();
  const updateMutation = useUpdateTransactionMutation();
  const deleteMutation = useDeleteTransactionMutation();
  const reimbursementMutation = useCreateReimbursementMutation();
  const reimbursementSubmissionRef = useRef<string | null>(null);
  const reimbursementUndoRef = useRef<string | null>(null);
  const sourceDeletionRef = useRef<string | null>(null);
  const form = useTransactionForm({
    onSubmit: async (values) => {
      await handleSubmit(values);
    },
  });
  const reimbursementForm = useTransactionForm({
    onSubmit: async (values) => {
      await handleReimbursementSubmit(values);
    },
  });
  const {
    type: formType,
    category: formCategory,
    amount: formAmount,
    currency: formCurrency,
    account: formAccount,
    forValue: formForValue,
    dateObject: formDateObject,
    note: formNote,
  } = form.useStore((state) => state.values);
  const reimbursementValues = reimbursementForm.useStore(
    (state) => state.values,
  );
  const activeValues =
    flowMode.kind === "reimburse"
      ? reimbursementValues
      : {
          type: formType,
          category: formCategory,
          amount: formAmount,
          currency: formCurrency,
          account: formAccount,
          forValue: formForValue,
          dateObject: formDateObject,
          note: formNote,
        };
  const { type, category, amount, currency, account, forValue, dateObject, note } =
    activeValues;
  const activeForm =
    flowMode.kind === "reimburse" ? reimbursementForm : form;
  const fieldsLocked = reimbursementFieldsLocked(flowMode);
  const reimbursementFieldsLockedRef = useRef(fieldsLocked);
  reimbursementFieldsLockedRef.current = fieldsLocked;
  const reimbursementSource =
    flowMode.kind === "reimburse"
      ? flowMode.source
      : flowMode.kind === "edit" &&
          isReimbursableExpense(flowMode.transaction)
        ? flowMode.transaction
        : null;
  const reimbursementSummary = useReimbursementSummary({
    source: reimbursementSource,
    excludeChildId:
      flowMode.kind === "reimburse" &&
      createdReimbursement?.status === "error"
        ? createdReimbursement.id
        : undefined,
  });
  const placesMode: PlacesFlowMode = flowMode.kind;
  const shouldFetchNearbyPlaces = isPlacesEligible({
    step,
    type,
    mode: placesMode,
    hasReceipt: step === 2 || receiptData !== null,
  });
  const canSearchPlaces =
    shouldFetchNearbyPlaces && isOnline && hasGoogleMapsApiKey();
  placeSearchOpenRef.current = placeSearchOpen;
  canSearchPlacesRef.current = canSearchPlaces;
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

  const invalidatePlaceSearch = useCallback(() => {
    const nextGeneration = placeSearchGenerationRef.current + 1;
    placeSearchGenerationRef.current = nextGeneration;
    activePlaceSearchSessionRef.current = null;
    placeSearchOpenRef.current = false;
    return nextGeneration;
  }, []);

  const restorePlacePickerFocus = useCallback((closedGeneration: number) => {
    window.requestAnimationFrame(() => {
      if (
        placeSearchGenerationRef.current !== closedGeneration ||
        placeSearchOpenRef.current
      ) {
        return;
      }
      const searchButton = placeSearchButtonRef.current;
      if (searchButton?.isConnected) {
        searchButton.focus();
        return;
      }
      noteInputRef.current?.focus();
    });
  }, []);

  const closePlaceSearch = useCallback(() => {
    const closedGeneration = invalidatePlaceSearch();
    setPlaceSearchOpen(false);
    restorePlacePickerFocus(closedGeneration);
  }, [invalidatePlaceSearch, restorePlacePickerFocus]);

  const openPlaceSearch = useCallback(() => {
    if (!canSearchPlaces) {
      return;
    }
    const sessionId = createPlaceSessionId();
    placeSearchGenerationRef.current += 1;
    activePlaceSearchSessionRef.current = sessionId;
    placeSearchOpenRef.current = true;
    setPlaceSearchSessionId(sessionId);
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
      const selectionGeneration = placeSearchGenerationRef.current;
      const selectionSessionId = activePlaceSearchSessionRef.current;
      if (
        !selectionSessionId ||
        !placeSearchOpenRef.current ||
        !canSearchPlacesRef.current
      ) {
        return;
      }

      try {
        const displayName = await placeAutocomplete.selectSuggestion(suggestion);
        if (
          placeSearchGenerationRef.current !== selectionGeneration ||
          activePlaceSearchSessionRef.current !== selectionSessionId ||
          !placeSearchOpenRef.current ||
          !canSearchPlacesRef.current
        ) {
          return;
        }
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
    if (canSearchPlaces) {
      return;
    }
    if (placeSearchOpenRef.current) {
      closePlaceSearch();
      return;
    }
    invalidatePlaceSearch();
  }, [canSearchPlaces, closePlaceSearch, invalidatePlaceSearch]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      reimbursementFieldsLockedRef.current
    ) {
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
      activeForm.setFieldValue("account", lastAccount);
      return;
    }
    // Default to first account if only one exists
    if (onboarding.accounts.length === 1) {
      activeForm.setFieldValue("account", onboarding.accounts[0].name);
    }
  }, [account, activeForm, onboarding.accounts]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      reimbursementFieldsLockedRef.current
    ) {
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
    if (
      typeof window === "undefined" ||
      !account ||
      reimbursementFieldsLockedRef.current
    ) {
      return;
    }
    const lastCurrencyForAccount = window.localStorage.getItem(
      `${STORAGE_KEYS.LAST_CURRENCY}_${account}`
    );
    if (lastCurrencyForAccount) {
      activeForm.setFieldValue("currency", lastCurrencyForAccount);
    }
  }, [account, activeForm]);

  useEffect(() => {
    if (reimbursementFieldsLockedRef.current) {
      return;
    }
    if (type === "transfer" && forValue) {
      const isAccountValue = onboarding.accounts.some(
        (a) => a.name === forValue
      );
      if (!isAccountValue) {
        activeForm.setFieldValue("forValue", "");
      }
    }
  }, [type, forValue, activeForm, onboarding.accounts]);

  useEffect(() => {
    if (reimbursementFieldsLockedRef.current) {
      return;
    }
    if (type === "transfer" && account && forValue === account) {
      activeForm.setFieldValue("forValue", "");
    }
  }, [type, account, forValue, activeForm]);

  useEffect(() => {
    if (type === "transfer" || reimbursementFieldsLockedRef.current) {
      return;
    }
    if (!forValue || !FOR_OPTIONS.includes(forValue)) {
      activeForm.setFieldValue("forValue", "Me");
    }
  }, [type, forValue, activeForm]);

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
    if (
      deleteMutation.isPending ||
      sourceDeletionRef.current !== null
    ) {
      return;
    }
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
    void activeForm.handleSubmit();
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
    flowGeneration.transition("dashboard");
    invalidatePlaceSearch();
    setStep(0);
    setPlaceSearchOpen(false);
    setPlaceSuggestionSessionId(createPlaceSessionId());
    setPlaceSearchSessionId(createPlaceSessionId());
    setReceiptData(null);
    setCreatedReimbursement(null);
    setFlowMode({ kind: "create" });
    setShowDeleteConfirm(false);
    setCategoryDrawerOpen(false);
    setDateDrawerOpen(false);
    reimbursementSubmissionRef.current = null;
    reimbursementUndoRef.current = null;
    sourceDeletionRef.current = null;
    mutation.reset();
    updateMutation.reset();
    reimbursementMutation.reset();
    form.setFieldValue("type", TYPE_OPTIONS[0]);
    form.setFieldValue("category", "");
    form.setFieldValue("amount", "");
    form.setFieldValue("forValue", "Me");
    form.setFieldValue("note", "");
    form.setFieldValue("dateObject", new Date());
    reimbursementForm.setFieldValue("type", "income");
    reimbursementForm.setFieldValue("category", "");
    reimbursementForm.setFieldValue("amount", "");
    reimbursementForm.setFieldValue("forValue", "Me");
    reimbursementForm.setFieldValue("note", "");
    reimbursementForm.setFieldValue("dateObject", new Date());
  }, [
    mutation,
    updateMutation,
    reimbursementMutation,
    form,
    reimbursementForm,
    invalidatePlaceSearch,
    flowGeneration,
  ]);

  const openCreateAmountStep = useCallback(() => {
    flowGeneration.transition("create");
    setFlowMode({ kind: "create" });
    setCreatedReimbursement(null);
    setReceiptData(null);
    setShowDeleteConfirm(false);
    setPlaceSuggestionSessionId(createPlaceSessionId());
    setStep(1);
  }, [flowGeneration]);

  const handleEditTransaction = useCallback(
    async (transaction: TransactionRecord) => {
      if (
        deleteMutation.isPending ||
        sourceDeletionRef.current !== null
      ) {
        return;
      }
      const flowKey = editFlowKey(transaction.id);
      const token = flowGeneration.transition(flowKey);

      // Ensure transaction exists in IndexedDB for update/delete to work
      // (Recent transactions come from Google Sheets, not IndexedDB).
      const existingTransaction = await db.transactions.get(transaction.id);
      if (!flowGeneration.isCurrent(token, flowKey)) {
        return;
      }
      if (!existingTransaction) {
        await db.transactions.put(transaction);
        if (!flowGeneration.isCurrent(token, flowKey)) {
          return;
        }
      }

      form.setFieldValue("type", transaction.type);
      form.setFieldValue("category", transaction.category);
      form.setFieldValue("amount", String(transaction.amount));
      form.setFieldValue("currency", transaction.currency);
      form.setFieldValue("account", transaction.account);
      form.setFieldValue("forValue", transaction.for);
      form.setFieldValue("dateObject", parseDate(transaction.date));
      form.setFieldValue("note", transaction.note ?? "");
      setFlowMode({ kind: "edit", transaction });
      setCreatedReimbursement(null);
      setReceiptData(null);
      setShowDeleteConfirm(false);
      setStep(1);
    },
    [deleteMutation.isPending, flowGeneration, form],
  );

  const handleDelete = useCallback(() => {
    if (flowMode.kind !== "edit") return;
    const sourceId = flowMode.transaction.id;
    const flowKey = editFlowKey(sourceId);
    if (!showDeleteConfirm) {
      const confirmationToken = flowGeneration.capture();
      setShowDeleteConfirm(true);
      toast("Tap delete again to confirm", {
        duration: 3000,
        onAutoClose: () => {
          if (flowGeneration.isCurrent(confirmationToken, flowKey)) {
            setShowDeleteConfirm(false);
          }
        },
      });
      return;
    }
    if (
      deleteMutation.isPending ||
      sourceDeletionRef.current !== null
    ) {
      return;
    }
    const deletionToken = flowGeneration.capture();
    if (!flowGeneration.isCurrent(deletionToken, flowKey)) {
      return;
    }
    const deletionId = `${sourceId}:${deletionToken.generation}`;
    sourceDeletionRef.current = deletionId;
    deleteMutation.mutate(sourceId, {
      onSuccess: () => {
        if (flowGeneration.isCurrent(deletionToken, flowKey)) {
          resetFlow();
        }
      },
      onError: () => {
        if (flowGeneration.isCurrent(deletionToken, flowKey)) {
          toast.error("Failed to delete transaction");
        }
      },
      onSettled: () => {
        if (sourceDeletionRef.current === deletionId) {
          sourceDeletionRef.current = null;
        }
        if (flowGeneration.isCurrent(deletionToken, flowKey)) {
          setShowDeleteConfirm(false);
        }
      },
    });
  }, [
    flowMode,
    showDeleteConfirm,
    deleteMutation,
    flowGeneration,
    resetFlow,
  ]);

  function clearReceiptStep() {
    flowGeneration.transition("dashboard");
    setStep(0);
    setReceiptData(null);
    setCreatedReimbursement(null);
    setFlowMode({ kind: "create" });
    setShowDeleteConfirm(false);
    reimbursementSubmissionRef.current = null;
    reimbursementUndoRef.current = null;
    sourceDeletionRef.current = null;
    mutation.reset();
    updateMutation.reset();
    reimbursementMutation.reset();
  }

  function handleReceiptDone() {
    if (deleteMutation.isPending || reimbursementUndoRef.current !== null) {
      return;
    }
    clearReceiptTransition();
    resetFlow();
  }

  async function handleReceiptUndo() {
    if (flowMode.kind === "reimburse" && createdReimbursement) {
      if (
        deleteMutation.isPending ||
        reimbursementUndoRef.current !== null
      ) {
        return;
      }
      const childId = createdReimbursement.id;
      const flowKey = receiptFlowKey(childId);
      const undoToken = flowGeneration.capture();
      if (!flowGeneration.isCurrent(undoToken, flowKey)) {
        return;
      }
      const undoId = `${childId}:${undoToken.generation}`;
      reimbursementUndoRef.current = undoId;
      try {
        await deleteMutation.mutateAsync(childId);
        if (flowGeneration.isCurrent(undoToken, flowKey)) {
          resetFlow();
        }
      } catch (error) {
        if (flowGeneration.isCurrent(undoToken, flowKey)) {
          handleToast(
            error instanceof Error
              ? error.message
              : "Failed to undo reimbursement",
          );
        }
      } finally {
        if (reimbursementUndoRef.current === undoId) {
          reimbursementUndoRef.current = null;
        }
      }
      return;
    }
    if (deleteMutation.isPending) {
      return;
    }
    const undoToken = flowGeneration.capture();
    clearReceiptTransition();
    await handleUndo();
    if (flowGeneration.isCurrent(undoToken)) {
      resetFlow();
    }
  }

  async function handleUndo() {
    const result = await undoLast();
    handleToast(result.message);
  }

  function enterReimbursement() {
    if (
      flowMode.kind !== "edit" ||
      !isReimbursableExpense(flowMode.transaction) ||
      deleteMutation.isPending ||
      sourceDeletionRef.current !== null ||
      reimbursementSummary.isChecking ||
      reimbursementSummary.isError ||
      reimbursementSummary.summary.currencyMismatchIds.length > 0 ||
      reimbursementSummary.summary.overReimbursed > 0 ||
      !Number.isFinite(reimbursementSummary.summary.remaining) ||
      reimbursementSummary.summary.remaining <= 0
    ) {
      return;
    }

    const source = flowMode.transaction;
    const defaults = getReimbursementFormDefaults(
      source,
      reimbursementSummary.summary.remaining,
    );
    reimbursementForm.setFieldValue("type", defaults.type);
    reimbursementForm.setFieldValue("category", defaults.category);
    reimbursementForm.setFieldValue("amount", defaults.amount);
    reimbursementForm.setFieldValue("currency", defaults.currency);
    reimbursementForm.setFieldValue("account", defaults.account);
    reimbursementForm.setFieldValue("forValue", defaults.forValue);
    reimbursementForm.setFieldValue("dateObject", defaults.dateObject);
    reimbursementForm.setFieldValue("note", defaults.note);
    reimbursementMutation.reset();
    updateMutation.reset();
    reimbursementSubmissionRef.current = null;
    reimbursementUndoRef.current = null;
    setCreatedReimbursement(null);
    setReceiptData(null);
    setShowDeleteConfirm(false);
    setCategoryDrawerOpen(false);
    setDateDrawerOpen(false);
    flowGeneration.transition(reimbursementFlowKey(source.id));
    setFlowMode({ kind: "reimburse", source });
    setStep(1);
  }

  function handleAmountBack() {
    if (deleteMutation.isPending || sourceDeletionRef.current !== null) {
      return;
    }
    if (flowMode.kind === "reimburse") {
      if (
        reimbursementSubmissionRef.current !== null ||
        reimbursementMutation.isPending ||
        updateMutation.isPending
      ) {
        return;
      }
      flowGeneration.transition(editFlowKey(flowMode.source.id));
      setFlowMode({ kind: "edit", transaction: flowMode.source });
      setCreatedReimbursement(null);
      setReceiptData(null);
      setShowDeleteConfirm(false);
      setDateDrawerOpen(false);
      reimbursementMutation.reset();
      updateMutation.reset();
      setStep(1);
      return;
    }

    if (flowMode.kind === "edit") {
      flowGeneration.transition("dashboard");
      setFlowMode({ kind: "create" });
      setShowDeleteConfirm(false);
    } else {
      flowGeneration.transition("dashboard");
    }
    setStep(0);
  }

  async function handleReimbursementSubmit(values: TransactionFormValues) {
    if (
      flowMode.kind !== "reimburse" ||
      deleteMutation.isPending ||
      sourceDeletionRef.current !== null ||
      reimbursementSubmissionRef.current !== null ||
      reimbursementMutation.isPending ||
      updateMutation.isPending ||
      (createdReimbursement !== null &&
        createdReimbursement.status !== "error")
    ) {
      return;
    }

    const source = flowMode.source;
    const flowKey = reimbursementFlowKey(source.id);
    const submissionToken = flowGeneration.capture();
    if (!flowGeneration.isCurrent(submissionToken, flowKey)) {
      return;
    }
    const submissionId = `${source.id}:${submissionToken.generation}`;
    const nextReceipt: ReceiptData = {
      type: "income",
      category: REIMBURSEMENT_CATEGORY,
      amount: values.amount,
      currency: source.currency,
      account: values.account,
      forValue: source.for,
      dateObject: values.dateObject,
      note: values.note.trim(),
    };
    const variables = {
      source,
      amount: values.amount,
      remaining: reimbursementSummary.summary.remaining,
      account: values.account,
      date: values.dateObject,
      note: values.note,
    };
    reimbursementSubmissionRef.current = submissionId;
    try {
      const record =
        createdReimbursement?.status === "error"
          ? await updateMutation.mutateAsync({
              id: createdReimbursement.id,
              input: buildReimbursementInput(variables),
            })
          : await reimbursementMutation.mutateAsync(variables);
      if (!flowGeneration.isCurrent(submissionToken, flowKey)) {
        return;
      }
      if (record.status === "error") {
        throw new ReimbursementRecordError(
          record.error ??
            "Reimbursement could not be synced. Retry or delete it.",
          record,
        );
      }
      setCreatedReimbursement(record);
      setReceiptData(nextReceipt);
      flowGeneration.transition(receiptFlowKey(record.id));
      setStep(2);
    } catch (error) {
      if (flowGeneration.isCurrent(submissionToken, flowKey)) {
        if (error instanceof ReimbursementRecordError) {
          setCreatedReimbursement(error.record);
        }
        handleToast(
          error instanceof Error
            ? error.message
            : "Failed to save reimbursement",
        );
      }
    } finally {
      if (reimbursementSubmissionRef.current === submissionId) {
        reimbursementSubmissionRef.current = null;
      }
    }
  }

  async function handleSubmit(values: TransactionFormValues) {
    if (
      flowMode.kind === "reimburse" ||
      mutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      sourceDeletionRef.current !== null
    ) {
      return;
    }
    if (!values.type || !values.category || !values.amount) {
      handleToast("Complete all fields");
      return;
    }
    const parsedAmount = Number(values.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
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
    if (flowMode.kind === "edit") {
      const receiptKey = receiptFlowKey(flowMode.transaction.id);
      const submissionToken = flowGeneration.transition(receiptKey);
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
          id: flowMode.transaction.id,
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
        if (!flowGeneration.isCurrent(submissionToken, receiptKey)) {
          return;
        }
        scheduleReceiptTransition(() => {
          if (flowGeneration.isCurrent(submissionToken, receiptKey)) {
            resetFlow();
          }
        }, 2000);
      } catch (error) {
        if (!flowGeneration.isCurrent(submissionToken, receiptKey)) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to update transaction";
        handleToast(message);
        scheduleReceiptTransition(() => {
          if (flowGeneration.isCurrent(submissionToken, receiptKey)) {
            clearReceiptStep();
          }
        }, 2000);
      }
      return;
    }

    // Handle create mode
    const receiptKey = receiptFlowKey("create");
    const submissionToken = flowGeneration.transition(receiptKey);
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
      if (!flowGeneration.isCurrent(submissionToken, receiptKey)) {
        return;
      }
      scheduleReceiptTransition(() => {
        if (flowGeneration.isCurrent(submissionToken, receiptKey)) {
          resetFlow();
        }
      }, 2000);
    } catch (error) {
      if (!flowGeneration.isCurrent(submissionToken, receiptKey)) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Failed to save transaction";
      handleToast(message);
      scheduleReceiptTransition(() => {
        if (flowGeneration.isCurrent(submissionToken, receiptKey)) {
          clearReceiptStep();
        }
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
          form={activeForm}
          accounts={onboarding.accounts.map((a) => a.name)}
          onBack={handleAmountBack}
          onSubmit={handleFormSubmit}
          isSubmitting={
            flowMode.kind === "reimburse"
              ? reimbursementMutation.isPending || updateMutation.isPending
              : mutation.isPending || updateMutation.isPending
          }
          onDelete={flowMode.kind === "edit" ? handleDelete : undefined}
          isDeleting={deleteMutation.isPending}
          onCategoryClick={
            flowMode.kind === "edit" && !fieldsLocked
              ? () => {
                  if (
                    !deleteMutation.isPending &&
                    sourceDeletionRef.current === null
                  ) {
                    setCategoryDrawerOpen(true);
                  }
                }
              : undefined
          }
          onDateClick={
            flowMode.kind === "create"
              ? undefined
              : () => {
                  if (
                    !deleteMutation.isPending &&
                    sourceDeletionRef.current === null
                  ) {
                    setDateDrawerOpen(true);
                  }
                }
          }
          submitLabel={flowMode.kind === "edit" ? "Save" : undefined}
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
          currencyLocked={fieldsLocked}
          forLocked={fieldsLocked}
          preserveCurrencyOnAccountChange={fieldsLocked}
          middleAction={
            flowMode.kind === "edit" &&
            isReimbursableExpense(flowMode.transaction) ? (
              <ReimbursementAction
                summary={reimbursementSummary.summary}
                currency={flowMode.transaction.currency}
                isChecking={reimbursementSummary.isChecking}
                isError={reimbursementSummary.isError}
                isDeleting={deleteMutation.isPending}
                needsOnlineVerification={
                  reimbursementSummary.needsOnlineVerification
                }
                onRetry={() => void reimbursementSummary.retry()}
                onReimburse={enterReimbursement}
              />
            ) : undefined
          }
        />
      ),
    },
    {
      key: "step-receipt",
      label: "Receipt",
      className: "space-y-6 h-full",
      content: (() => {
        if (flowMode.kind === "reimburse") {
          return (
            <StepReceipt
              {...receiptSnapshot}
              isPending={
                reimbursementMutation.isPending && !createdReimbursement
              }
              isSuccess={Boolean(createdReimbursement)}
              isError={false}
              variant="reimbursement"
              syncStatus={createdReimbursement?.status}
              showTimedProgress={false}
              actionsDisabled={
                deleteMutation.isPending ||
                reimbursementUndoRef.current !== null
              }
              onDone={handleReceiptDone}
              onUndo={handleReceiptUndo}
            />
          );
        }

        const ordinaryMutation =
          flowMode.kind === "edit" ? updateMutation : mutation;
        return (
          <StepReceipt
            {...receiptSnapshot}
            isPending={ordinaryMutation.isPending}
            isSuccess={ordinaryMutation.isSuccess}
            isError={ordinaryMutation.isError}
            errorMessage={
              ordinaryMutation.error instanceof Error
                ? ordinaryMutation.error.message
                : ordinaryMutation.isError
                ? "Failed to save transaction"
                : undefined
            }
            onDone={handleReceiptDone}
            onUndo={
              flowMode.kind === "edit" ? undefined : handleReceiptUndo
            }
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

      {flowMode.kind !== "create" ? (
        <DateTimeDrawer
          value={dateObject}
          onChange={(date) => activeForm.setFieldValue("dateObject", date)}
          open={dateDrawerOpen}
          onOpenChange={setDateDrawerOpen}
          showTrigger={false}
        />
      ) : null}

      {flowMode.kind === "edit" && !fieldsLocked ? (
        <CategoryGridDrawer
          type={formType}
          onTypeChange={(newType) => {
            form.setFieldValue("type", newType);
            form.setFieldValue("category", "");
          }}
          categories={categoryGroups[formType] ?? []}
          onSelect={(cat) => {
            form.setFieldValue("category", cat);
            setCategoryDrawerOpen(false);
          }}
          open={categoryDrawerOpen}
          onOpenChange={setCategoryDrawerOpen}
          layoutId="editTransactionCategory"
        />
      ) : null}

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
