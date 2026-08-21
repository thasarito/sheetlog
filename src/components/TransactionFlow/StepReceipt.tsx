import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Check, Loader2, XCircle } from "lucide-react";
import type { TransactionStatus, TransactionType } from "../../lib/types";
import {
  CircleCheckIcon,
  type CircleCheckIconHandle,
} from "../icons/CircleCheckIcon";

export type ReceiptData = {
  type: TransactionType;
  category: string;
  amount: string;
  currency: string;
  account: string;
  forValue: string;
  dateObject: Date;
  note: string;
};

type StepReceiptProps = ReceiptData & {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  errorMessage?: string;
  onDone?: () => void;
  onUndo?: () => void;
  variant?: "transaction" | "reimbursement";
  syncStatus?: TransactionStatus;
  doneLabel?: string;
  undoLabel?: string;
  showTimedProgress?: boolean;
  actionsDisabled?: boolean;
  undoOutcome?: "pending" | "error";
  undoErrorMessage?: string;
};

type TimelineStepState = "complete" | "active" | "pending" | "error";
type TimelineStepId = "captured" | "local" | "sync";

type TimelineStep = {
  id: TimelineStepId;
  label: string;
  description: string;
  state: TimelineStepState;
};

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

const TIMELINE_STATE_LABELS: Record<TimelineStepState, string> = {
  complete: "Done",
  active: "In progress",
  pending: "Waiting",
  error: "Needs attention",
};

function timelineStateClasses(state: TimelineStepState): string {
  if (state === "complete") {
    return "border-success/35 bg-success/10 text-success";
  }
  if (state === "active") {
    return "border-warning/45 bg-warning/10 text-warning";
  }
  if (state === "error") {
    return "border-danger/35 bg-danger/10 text-danger";
  }
  return "border-border bg-background text-muted-foreground";
}

function timelineLabelClasses(state: TimelineStepState): string {
  if (state === "complete") return "text-success";
  if (state === "active") return "text-warning";
  if (state === "error") return "text-danger";
  return "text-muted-foreground";
}

function TimelineStateIcon({ state }: { state: TimelineStepState }) {
  if (state === "complete") {
    return <Check className="h-4 w-4" strokeWidth={2.5} />;
  }
  if (state === "active") {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }
  if (state === "error") {
    return <XCircle className="h-4 w-4" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-current" />;
}

function ReceiptTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol data-testid="receipt-timeline" className="mt-4">
      {steps.map((step, index) => (
        <li
          key={step.id}
          data-testid={`receipt-timeline-step-${step.id}`}
          data-state={step.state}
          className="relative grid min-h-[72px] grid-cols-[36px_minmax(0,1fr)] gap-3 last:min-h-0"
        >
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[17px] top-9 w-px bg-border"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border ${timelineStateClasses(
              step.state,
            )}`}
          >
            <TimelineStateIcon state={step.state} />
          </span>
          <div className="min-w-0 pb-5 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                {step.label}
              </p>
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider ${timelineLabelClasses(
                  step.state,
                )}`}
              >
                {TIMELINE_STATE_LABELS[step.state]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function StepReceipt({
  type,
  category,
  amount,
  currency,
  account,
  forValue,
  dateObject,
  note,
  isPending,
  isSuccess,
  isError,
  errorMessage,
  onDone,
  onUndo,
  variant = "transaction",
  syncStatus,
  doneLabel,
  undoLabel,
  showTimedProgress,
  actionsDisabled = false,
  undoOutcome,
  undoErrorMessage,
}: StepReceiptProps) {
  const amountLabel = amount ? amount : "0";
  const amountDisplay = `${currency} ${amountLabel}`;
  const normalizedStatus = isPending
    ? "loading"
    : isSuccess
      ? "success"
      : isError
        ? "error"
        : "loading";
  const isReimbursement = variant === "reimbursement";
  const isUndoPending = isReimbursement && undoOutcome === "pending";
  const isUndoError = isReimbursement && undoOutcome === "error";
  const presentationStatus = isUndoPending
    ? "loading"
    : isUndoError
      ? "error"
      : normalizedStatus;
  const isStatusSuccess = presentationStatus === "success";
  const isStatusError = presentationStatus === "error";
  const hasSuccessfulReceipt = normalizedStatus === "success";
  const resolvedSyncStatus = hasSuccessfulReceipt
    ? syncStatus ?? "synced"
    : undefined;
  let statusTitle: string;
  let statusDescription: string;

  if (isUndoPending) {
    statusTitle = "Undo queued";
    statusDescription =
      "This reimbursement stays counted until it is removed from Google Sheets.";
  } else if (isUndoError) {
    statusTitle = "Undo failed";
    statusDescription =
      undoErrorMessage || "Retry when Google Sheets is available.";
  } else if (normalizedStatus === "loading") {
    statusTitle = isReimbursement
      ? "Saving reimbursement"
      : "Saving transaction";
    statusDescription = isReimbursement
      ? "Hang tight while we record this reimbursement."
      : "Hang tight while we log this entry.";
  } else if (normalizedStatus === "error") {
    statusTitle = isReimbursement ? "Reimbursement failed" : "Save failed";
    statusDescription =
      errorMessage || "Check your connection and try again.";
  } else if (isReimbursement && resolvedSyncStatus === "synced") {
    statusTitle = "Reimbursement recorded";
    statusDescription = "Saved to Google Sheets.";
  } else if (isReimbursement && resolvedSyncStatus === "error") {
    statusTitle = "Reimbursement saved locally";
    statusDescription = "Google Sheets sync needs attention.";
  } else if (isReimbursement) {
    statusTitle = "Reimbursement queued";
    statusDescription = "Saved locally and will sync to Google Sheets.";
  } else {
    statusTitle = "Payment Successful";
    statusDescription =
      resolvedSyncStatus === "pending"
        ? "Saved locally and will sync to Google Sheets."
        : resolvedSyncStatus === "error"
          ? "Saved locally, but Google Sheets sync needs attention."
          : "Transaction added to your ledger.";
  }

  const resolvedDoneLabel = doneLabel ?? "Done";
  const resolvedUndoLabel =
    undoLabel ??
    (isUndoError
      ? "Retry undo"
      : isReimbursement
        ? "Undo reimbursement"
        : "Undo");
  const shouldShowTimedProgress =
    showTimedProgress ?? variant === "transaction";
  const accountLabel = type === "transfer" ? "From" : "Account";
  const forLabel = type === "transfer" ? "To" : "For";
  const checkIconRef = useRef<CircleCheckIconHandle | null>(null);

  useEffect(() => {
    if (isStatusSuccess) {
      checkIconRef.current?.startAnimation();
    }
  }, [isStatusSuccess]);

  const timelineSteps = useMemo<TimelineStep[]>(() => {
    if (isUndoPending || isUndoError) {
      return [
        {
          id: "captured",
          label: "Undo requested",
          description: "The exact reimbursement was selected for removal.",
          state: "complete",
        },
        {
          id: "local",
          label: "Queued locally",
          description: "SheetLog will keep retrying this exact undo safely.",
          state: "complete",
        },
        {
          id: "sync",
          label: "Removed from Sheets",
          description: isUndoError
            ? undoErrorMessage || "Retry when Google Sheets is available."
            : "Waiting for Google Sheets to confirm removal.",
          state: isUndoError ? "error" : "active",
        },
      ];
    }

    const localState: TimelineStepState =
      normalizedStatus === "loading"
        ? "active"
        : normalizedStatus === "error"
          ? "error"
          : "complete";
    const syncState: TimelineStepState =
      normalizedStatus !== "success"
        ? "pending"
        : resolvedSyncStatus === "pending"
          ? "active"
          : resolvedSyncStatus === "error"
            ? "error"
            : "complete";
    const localDescription =
      localState === "active"
        ? "Saving this entry on your device."
        : localState === "error"
          ? "SheetLog could not finish saving this entry."
          : "Available in your SheetLog ledger.";
    const syncDescription =
      syncState === "complete"
        ? "Google Sheets is up to date."
        : syncState === "active"
          ? "Queued for Google Sheets."
          : syncState === "error"
            ? "Google Sheets sync needs attention."
            : "Waiting for the local save to finish.";

    return [
      {
        id: "captured",
        label: "Captured",
        description: isReimbursement
          ? "Reimbursement details validated."
          : "Transaction details validated.",
        state: "complete",
      },
      {
        id: "local",
        label: "Saved locally",
        description: localDescription,
        state: localState,
      },
      {
        id: "sync",
        label: "Synced to Sheets",
        description: syncDescription,
        state: syncState,
      },
    ];
  }, [
    isReimbursement,
    isUndoError,
    isUndoPending,
    normalizedStatus,
    resolvedSyncStatus,
    undoErrorMessage,
  ]);

  const statusToneClass = isStatusError
    ? "border-danger/25 bg-danger/5 text-danger"
    : presentationStatus === "loading" || resolvedSyncStatus !== "synced"
      ? "border-warning/30 bg-warning/5 text-warning"
      : "border-success/25 bg-success/5 text-success";

  return (
    <div
      data-testid="step-receipt"
      data-transaction-step="receipt"
      className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-4 pb-safe-offset-6"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        <section
          data-testid="receipt-amount-card"
          aria-label="Transaction summary"
          className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-5"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-10 -right-8 h-32 w-32 rounded-full border-[24px] border-primary/10"
          />
          <div className="relative z-10 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex min-w-0 items-center gap-2 normal-case tracking-normal text-foreground">
              <span className="h-2 w-2 shrink-0 rounded-[3px] bg-primary" />
              <span className="truncate">{category || "Uncategorized"}</span>
            </span>
            <span>{TYPE_LABELS[type]}</span>
          </div>
          <p className="relative z-10 mt-5 text-[clamp(2.5rem,12vw,3.25rem)] font-semibold leading-none tracking-[-0.055em] text-foreground tabular-nums">
            {amountDisplay}
          </p>
          <dl className="relative z-10 mt-5 grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {accountLabel}
              </dt>
              <dd
                className="mt-1 truncate text-xs font-semibold text-foreground"
                title={account || undefined}
              >
                {account || "—"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {forLabel}
              </dt>
              <dd
                className="mt-1 truncate text-xs font-semibold text-foreground"
                title={forValue || undefined}
              >
                {forValue || "—"}
              </dd>
            </div>
            <div className="min-w-0 text-right">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </dt>
              <dd className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground tabular-nums">
                {format(dateObject, "dd MMM · HH:mm")}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6" aria-label="Entry progress">
          <div className="flex items-end justify-between gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Entry progress
            </p>
            <span className="text-xs font-semibold text-muted-foreground">
              {isUndoPending || isUndoError ? "Undo" : "Save & sync"}
            </span>
          </div>

          <div
            role={isStatusError ? "alert" : "status"}
            aria-live={isStatusError ? undefined : "polite"}
            aria-atomic="true"
            className={`mt-3 flex items-start gap-3 rounded-2xl border p-3.5 ${statusToneClass}`}
          >
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current/20 bg-background/70"
              aria-hidden="true"
            >
              {isStatusSuccess ? (
                <CircleCheckIcon
                  ref={checkIconRef}
                  size={21}
                  className="text-current"
                />
              ) : isStatusError ? (
                <XCircle className="h-5 w-5" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {statusTitle}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {statusDescription}
              </p>
            </div>
          </div>

          <ReceiptTimeline steps={timelineSteps} />
        </section>

        <section
          aria-label="Additional transaction details"
          className="mt-2 border-y border-border"
        >
          <div className="grid grid-cols-[1fr_minmax(0,2fr)] gap-4 py-3">
            <span className="text-xs text-muted-foreground">Note</span>
            <span
              className={`break-words text-right text-sm font-medium ${
                note ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {note || "—"}
            </span>
          </div>
        </section>
      </div>

      {hasSuccessfulReceipt ? (
        <div className="shrink-0 space-y-3">
          <button
            type="button"
            className="relative flex min-h-12 w-full items-center justify-center overflow-hidden rounded-2xl bg-success px-4 text-sm font-semibold text-success-foreground disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onDone}
            disabled={actionsDisabled}
          >
            <span className="relative z-10">{resolvedDoneLabel}</span>
            {shouldShowTimedProgress ? (
              <motion.span
                data-testid="receipt-timed-progress"
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-1 w-full origin-left bg-success-foreground/35"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 2, ease: "linear" }}
              />
            ) : null}
          </button>
          {isUndoPending ? null : (
            <button
              type="button"
              className="min-h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onUndo}
              disabled={actionsDisabled}
            >
              {resolvedUndoLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
