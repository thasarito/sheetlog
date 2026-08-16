import { HandCoins, Loader2, RotateCcw } from "lucide-react";
import type { ReimbursementSummary } from "../../lib/reimbursements";

export type ReimbursementActionProps = {
  summary: ReimbursementSummary;
  isChecking: boolean;
  isError: boolean;
  isDeleting?: boolean;
  onRetry: () => void;
  onReimburse: () => void;
};

export function ReimbursementAction({
  summary,
  isChecking,
  isError,
  isDeleting = false,
  onRetry,
  onReimburse,
}: ReimbursementActionProps) {
  const hasCurrencyMismatch = summary.currencyMismatchIds.length > 0;
  const isOverReimbursed =
    Number.isFinite(summary.overReimbursed) && summary.overReimbursed > 0;
  const hasKnownRemaining = Number.isFinite(summary.remaining);
  const isFullyReimbursed =
    !isChecking &&
    !isError &&
    hasKnownRemaining &&
    summary.remaining <= 0 &&
    !isOverReimbursed &&
    !hasCurrencyMismatch;
  const canReimburse =
    !isChecking &&
    !isError &&
    !isDeleting &&
    !hasCurrencyMismatch &&
    !isOverReimbursed &&
    hasKnownRemaining &&
    summary.remaining > 0;
  const canRetry = isError && !isChecking && !isDeleting;
  const isLoading = isChecking && !isDeleting;

  const accessibleName = isDeleting
    ? "Reimbursement unavailable"
    : isChecking
      ? "Checking reimbursements"
      : canRetry
        ? "Retry reimbursement check"
        : isFullyReimbursed
          ? "Fully reimbursed"
          : canReimburse
            ? "Reimburse"
            : "Reimbursement unavailable";

  const Icon = isLoading ? Loader2 : canRetry ? RotateCcw : HandCoins;

  return (
    <>
      <output
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {accessibleName}
      </output>
      <button
        type="button"
        aria-label={accessibleName}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => {
          if (canRetry) {
            onRetry();
          } else if (canReimburse) {
            onReimburse();
          }
        }}
        disabled={!canRetry && !canReimburse}
      >
        <Icon
          className={`h-4 w-4${isLoading ? " animate-spin motion-reduce:animate-none" : ""}`}
          aria-hidden="true"
        />
      </button>
    </>
  );
}
