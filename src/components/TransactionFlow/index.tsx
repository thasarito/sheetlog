import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { parseDate } from "../../lib/date-utils";
import {
  useConnectivity,
  useSession,
  useTransactions,
  useWorkspace,
} from "../../app/providers";
import { useOnboarding } from "../../hooks/useOnboarding";
import { Header } from "../Header";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import { STORAGE_KEYS } from "../../lib/constants";
import { db } from "../../lib/db";
import { toLocalTransactionRecord } from "../../lib/transactionHistory";
import type {
  TransactionType,
  CategoryItem,
  TransactionRecord,
  TransactionUpdateInput,
} from "../../lib/types";
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
import { TransactionHistoryDrawer } from "./TransactionHistoryDrawer";
import { HomeDashboardCarousel } from "./HomeDashboardCarousel";
import { CategoryGridDrawer } from "../CategoryGridDrawer";
import { DateTimeDrawer } from "../DateTimeDrawer";
import {
  UpdateTransactionRecordError,
  useUpdateTransactionMutation,
} from "./useUpdateTransactionMutation";
import { useDeleteTransactionMutation } from "./useDeleteTransactionMutation";
import { useNearbyPlaceSuggestions } from "./useNearbyPlaceSuggestions";
import { hasGoogleMapsApiKey } from "../../lib/googlePlaces";
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
  validateReimbursementAmount,
} from "../../lib/reimbursements";
import { createFlowGeneration } from "./flowGeneration";
import { useTransactionByIdQuery } from "./useTransactionByIdQuery";
import { createPlaceSessionId } from "./placeSessionId";
import {
  buildPlaceUpdatePatch,
  replaceTransactionNote,
} from "./transactionNoteForm";
import { useStableTransactionHeight } from "./useStableTransactionHeight";

type ToastAction = { label: string; onClick: () => void };
type StepDefinition = {
  key: string;
  label: string;
  className: string;
  content: React.ReactNode;
};

function editFlowKey(transactionId: string) {
  return `edit:${transactionId}`;
}

function reimbursementFlowKey(sourceId: string) {
  return `reimburse:${sourceId}`;
}

function receiptFlowKey(transactionId: string) {
  return `receipt:${transactionId}`;
}

function linkedLockedFieldsMatch(
  values: TransactionFormValues,
  original: TransactionRecord,
): boolean {
  return (
    values.type === original.type &&
    values.category === original.category &&
    values.currency === original.currency &&
    values.forValue === original.for
  );
}

function buildLinkedEditInput(
  values: TransactionFormValues,
  original: TransactionRecord,
): TransactionUpdateInput {
  return {
    type: original.type,
    category: original.category,
    amount: Number(values.amount),
    currency: original.currency,
    account: values.account,
    for: original.for,
    date: format(values.dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
    note: values.note.trim() || undefined,
    reimbursesTransactionId: original.reimbursesTransactionId,
    ...buildPlaceUpdatePatch(original.place, values.place),
  };
}

function receiptDataFromRecord(record: TransactionRecord): ReceiptData {
  return {
    type: record.type,
    category: record.category,
    amount: String(record.amount),
    currency: record.currency,
    account: record.account,
    forValue: record.for,
    dateObject: parseDate(record.date),
    note: record.note ?? "",
  };
}

export function TransactionFlow() {
  const stableTransactionHeight = useStableTransactionHeight();
  const { undoLast, lastSyncError, lastSyncErrorAt } = useTransactions();
  const { userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const { onboarding } = useOnboarding();
  const { isOnline } = useConnectivity();
  const [step, setStep] = useState(0);
  const [placeSuggestionSessionId, setPlaceSuggestionSessionId] = useState(
    createPlaceSessionId
  );
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [flowMode, setFlowMode] = useState<TransactionFlowMode>({
    kind: "create",
  });
  const [createdReimbursement, setCreatedReimbursement] =
    useState<TransactionRecord | null>(null);
  const [reimbursementUndoState, setReimbursementUndoState] = useState<{
    outcome: "pending" | "error";
    message?: string;
  } | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [dateDrawerOpen, setDateDrawerOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [flowGeneration] = useState(() =>
    createFlowGeneration("dashboard"),
  );
  const noteInputRef = useRef<HTMLInputElement>(null);
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
    place: formPlace,
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
          place: formPlace,
        };
  const {
    type,
    category,
    amount,
    currency,
    account,
    forValue,
    dateObject,
    note,
    place,
  } = activeValues;
  const activeForm =
    flowMode.kind === "reimburse" ? reimbursementForm : form;
  const fieldsLocked = reimbursementFieldsLocked(flowMode);
  const reimbursementFieldsLockedRef = useRef(fieldsLocked);
  reimbursementFieldsLockedRef.current = fieldsLocked;
  const linkedEditTransaction =
    flowMode.kind === "edit" && flowMode.transaction.reimbursesTransactionId
      ? flowMode.transaction
      : null;
  const linkedEditSourceQuery = useTransactionByIdQuery(
    linkedEditTransaction?.reimbursesTransactionId,
  );
  const linkedEditSource = linkedEditTransaction
    ? linkedEditSourceQuery.data
    : null;
  const linkedEditSourceIsChecking = Boolean(
    linkedEditTransaction &&
      (linkedEditSourceQuery.isChecking ||
        linkedEditSourceQuery.isLoading ||
        (!linkedEditSourceQuery.isError && linkedEditSource === undefined)),
  );
  const linkedEditSourceIsError = Boolean(
    linkedEditTransaction && linkedEditSourceQuery.isError,
  );
  const linkedEditSourceIsMissing = Boolean(
    linkedEditTransaction &&
      !linkedEditSourceIsChecking &&
      !linkedEditSourceIsError &&
      linkedEditSource === null,
  );
  const linkedEditSourceIsReimbursable = Boolean(
    linkedEditTransaction &&
      linkedEditSource &&
      isReimbursableExpense(linkedEditSource) &&
      linkedEditSource.currency === linkedEditTransaction.currency,
  );
  const reimbursementSource =
    flowMode.kind === "reimburse"
      ? flowMode.source
      : linkedEditTransaction
        ? linkedEditSource ?? null
      : flowMode.kind === "edit" &&
          isReimbursableExpense(flowMode.transaction)
        ? flowMode.transaction
        : null;
  const reimbursementSummary = useReimbursementSummary({
    source: reimbursementSource,
    excludeChildId:
      linkedEditTransaction?.id ??
      (flowMode.kind === "reimburse" &&
      createdReimbursement?.status === "error"
        ? createdReimbursement.id
        : undefined),
  });
  const linkedAmountLocked = Boolean(
    linkedEditTransaction &&
      (!linkedEditSourceIsReimbursable ||
        linkedEditSourceIsChecking ||
        linkedEditSourceIsError ||
        reimbursementSummary.isChecking ||
        reimbursementSummary.isError),
  );
  const linkedEditConstraintMessage = linkedEditTransaction
    ? linkedEditSourceIsChecking
      ? "Checking original expense..."
      : linkedEditSourceIsError
        ? "Unable to load original expense."
        : linkedEditSourceIsMissing
          ? "Original expense unavailable"
          : linkedEditSource && !isReimbursableExpense(linkedEditSource)
            ? "Original expense is no longer reimbursable"
            : linkedEditSource &&
                linkedEditSource.currency !== linkedEditTransaction.currency
              ? "Reimbursement currency no longer matches original expense"
              : reimbursementSummary.isChecking
                ? "Checking reimbursement limit..."
                : reimbursementSummary.isError
                  ? "Unable to check reimbursement limit."
                  : null
    : null;
  const placesMode: PlacesFlowMode = flowMode.kind;
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
  const receiptTimeoutRef = useRef<number | null>(null);
  const lastSyncErrorRef = useRef<string | null>(null);

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
    if (linkedEditTransaction) {
      void handleSubmit({
        type,
        category,
        amount,
        currency,
        account,
        forValue,
        dateObject,
        note,
        place,
      });
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
      place,
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

  const resetFlow = useCallback(() => {
    flowGeneration.transition("dashboard");
    setStep(0);
    setPlaceSuggestionSessionId(createPlaceSessionId());
    setReceiptData(null);
    setCreatedReimbursement(null);
    setReimbursementUndoState(null);
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
    replaceTransactionNote(form, "");
    form.setFieldValue("dateObject", new Date());
    reimbursementForm.setFieldValue("type", "income");
    reimbursementForm.setFieldValue("category", "");
    reimbursementForm.setFieldValue("amount", "");
    reimbursementForm.setFieldValue("forValue", "Me");
    replaceTransactionNote(reimbursementForm, "");
    reimbursementForm.setFieldValue("dateObject", new Date());
  }, [
    mutation,
    updateMutation,
    reimbursementMutation,
    form,
    reimbursementForm,
    flowGeneration,
  ]);

  const openCreateAmountStep = useCallback(() => {
    flowGeneration.transition("create");
    setFlowMode({ kind: "create" });
    setCreatedReimbursement(null);
    setReimbursementUndoState(null);
    setReceiptData(null);
    setShowDeleteConfirm(false);
    setPlaceSuggestionSessionId(createPlaceSessionId());
    setStep(1);
  }, [flowGeneration]);

  const handleEditTransaction = useCallback(
    async (transaction: TransactionRecord) => {
      setHistoryDrawerOpen(false);
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
      if (
        sheetId &&
        userProfile?.id &&
        (!existingTransaction || existingTransaction.status === "synced")
      ) {
        await db.transactions.put({
          ...toLocalTransactionRecord(transaction),
          targetSheetId: sheetId,
          targetUserId: userProfile.id,
        });
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
      form.setFieldValue("place", transaction.place);
      setFlowMode({ kind: "edit", transaction });
      setCreatedReimbursement(null);
      setReimbursementUndoState(null);
      setReceiptData(null);
      setShowDeleteConfirm(false);
      setStep(1);
    },
    [
      deleteMutation.isPending,
      flowGeneration,
      form,
      sheetId,
      userProfile?.id,
    ],
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
    setReimbursementUndoState(null);
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
    if (createdReimbursement?.reimbursesTransactionId) {
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
        const result = await deleteMutation.mutateAsync(childId);
        if (flowGeneration.isCurrent(undoToken, flowKey)) {
          if (result.outcome === "pending") {
            setReimbursementUndoState({ outcome: "pending" });
          } else if (result.outcome === "error") {
            setReimbursementUndoState({
              outcome: "error",
              message: result.message,
            });
            handleToast(result.message);
          } else {
            resetFlow();
          }
        }
      } catch (error) {
        if (flowGeneration.isCurrent(undoToken, flowKey)) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to undo reimbursement";
          setReimbursementUndoState({ outcome: "error", message });
          handleToast(message);
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
    replaceTransactionNote(reimbursementForm, defaults.note);
    reimbursementMutation.reset();
    updateMutation.reset();
    reimbursementSubmissionRef.current = null;
    reimbursementUndoRef.current = null;
    setCreatedReimbursement(null);
    setReimbursementUndoState(null);
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
      setReimbursementUndoState(null);
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
      setCreatedReimbursement(record);
      setReimbursementUndoState(null);
      setReceiptData(receiptDataFromRecord(record));
      flowGeneration.transition(receiptFlowKey(record.id));
      setStep(2);
    } catch (error) {
      if (flowGeneration.isCurrent(submissionToken, flowKey)) {
        if (
          error instanceof ReimbursementRecordError ||
          error instanceof UpdateTransactionRecordError
        ) {
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

  async function handleLinkedEditSubmit(
    original: TransactionRecord,
    values: TransactionFormValues,
  ) {
    if (
      !original.reimbursesTransactionId ||
      deleteMutation.isPending ||
      sourceDeletionRef.current !== null ||
      reimbursementSubmissionRef.current !== null ||
      updateMutation.isPending
    ) {
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

    const canChangeAmount = Boolean(
      linkedEditSourceIsReimbursable &&
        !linkedEditSourceIsChecking &&
        !linkedEditSourceIsError &&
        !reimbursementSummary.isChecking &&
        !reimbursementSummary.isError,
    );
    const amountChanged = parsedAmount !== original.amount;
    if (!canChangeAmount) {
      if (amountChanged || !linkedLockedFieldsMatch(values, original)) {
        handleToast(
          linkedEditConstraintMessage ?? "Original expense unavailable",
        );
        return;
      }
    } else if (amountChanged) {
      const validationError = validateReimbursementAmount(
        parsedAmount,
        reimbursementSummary.summary,
      );
      if (validationError) {
        handleToast(validationError);
        return;
      }
    }

    const input = buildLinkedEditInput(values, original);
    const flowKey = editFlowKey(original.id);
    const submissionToken = flowGeneration.capture();
    if (!flowGeneration.isCurrent(submissionToken, flowKey)) {
      return;
    }
    const submissionId = `${original.id}:${submissionToken.generation}`;

    reimbursementSubmissionRef.current = submissionId;
    try {
      const record = await updateMutation.mutateAsync({
        id: original.id,
        input,
      });
      if (!flowGeneration.isCurrent(submissionToken, flowKey)) {
        return;
      }
      setFlowMode({ kind: "edit", transaction: record });
      setCreatedReimbursement(record);
      setReimbursementUndoState(null);
      setReceiptData(receiptDataFromRecord(record));
      flowGeneration.transition(receiptFlowKey(record.id));
      setStep(2);
    } catch (error) {
      if (flowGeneration.isCurrent(submissionToken, flowKey)) {
        if (error instanceof UpdateTransactionRecordError) {
          setFlowMode({ kind: "edit", transaction: error.record });
        }
        setCreatedReimbursement(null);
        setReceiptData(null);
        handleToast(
          error instanceof Error
            ? error.message
            : "Failed to update reimbursement",
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
    if (
      flowMode.kind === "edit" &&
      flowMode.transaction.reimbursesTransactionId
    ) {
      await handleLinkedEditSubmit(flowMode.transaction, values);
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
        const record = await updateMutation.mutateAsync({
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
            ...buildPlaceUpdatePatch(
              flowMode.transaction.place,
              values.place,
            ),
          },
        });
        if (!flowGeneration.isCurrent(submissionToken, receiptKey)) {
          return;
        }
        setReceiptData(receiptDataFromRecord(record));
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
      className: "min-h-0",
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
          places={
            shouldFetchNearbyPlaces
              ? {
                  enabled: canSearchPlaces,
                  nearbySuggestions: nearbyPlaces.suggestions,
                  isNearbyLoading: nearbyPlaces.isLoading,
                  locationBias: nearbyPlaces.coordinates,
                }
              : undefined
          }
          noteInputRef={noteInputRef}
          currencyLocked={fieldsLocked}
          forLocked={fieldsLocked}
          amountLocked={linkedAmountLocked}
          preserveCurrencyOnAccountChange={fieldsLocked}
          formNotice={
            linkedEditConstraintMessage ? (
              <div
                role={
                  linkedEditSourceIsError || linkedEditSourceIsMissing
                    ? "alert"
                    : "status"
                }
                className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span>{linkedEditConstraintMessage}</span>
                {linkedEditSourceIsError ? (
                  <button
                    type="button"
                    className="font-semibold text-foreground underline underline-offset-2"
                    onClick={() => void linkedEditSourceQuery.refetch()}
                  >
                    Retry
                  </button>
                ) : reimbursementSummary.isError ? (
                  <button
                    type="button"
                    className="font-semibold text-foreground underline underline-offset-2"
                    onClick={() => void reimbursementSummary.retry()}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : undefined
          }
          middleAction={
            flowMode.kind === "edit" &&
            isReimbursableExpense(flowMode.transaction) ? (
              <ReimbursementAction
                summary={reimbursementSummary.summary}
                isChecking={reimbursementSummary.isChecking}
                isError={reimbursementSummary.isError}
                isDeleting={deleteMutation.isPending}
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
        const isLinkedEditReceipt = Boolean(
          flowMode.kind === "edit" &&
            flowMode.transaction.reimbursesTransactionId,
        );
        if (flowMode.kind === "reimburse" || isLinkedEditReceipt) {
          return (
            <StepReceipt
              {...receiptSnapshot}
              isPending={
                (flowMode.kind === "reimburse"
                  ? reimbursementMutation.isPending
                  : updateMutation.isPending) && !createdReimbursement
              }
              isSuccess={Boolean(createdReimbursement)}
              isError={false}
              variant="reimbursement"
              syncStatus={createdReimbursement?.status}
              undoOutcome={reimbursementUndoState?.outcome}
              undoErrorMessage={reimbursementUndoState?.message}
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
    <main
      data-testid="transaction-canvas"
      style={{ height: `${stableTransactionHeight}px` }}
      className="h-full shrink-0 from-surface via-background to-surface p-0 font-['SF_Pro_Text','SF_Pro_Display','Helvetica_Neue',system-ui] text-foreground antialiased sm:px-6"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {/* Header with settings drawer */}
        <Header
          showSettings
          onToast={handleToast}
        />

        {/* Main content - full height */}
        <div className="flex-1 min-h-0 pb-6">
          {step === 0 ? (
            <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
              <div className="min-h-0">
                <HomeDashboardCarousel
                  baseCurrency={onboarding.analyticsBaseCurrency}
                  onEditTransaction={handleEditTransaction}
                  onViewAllTransactions={() => setHistoryDrawerOpen(true)}
                />
              </div>
              <div className="min-h-0">
                <StepCard
                  animationKey={activeStep.key}
                  className={activeStep.className}
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

      <TransactionHistoryDrawer
        open={historyDrawerOpen}
        onOpenChange={setHistoryDrawerOpen}
        onEditTransaction={(transaction) => {
          void handleEditTransaction(transaction);
        }}
      />

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

    </main>
  );
}
