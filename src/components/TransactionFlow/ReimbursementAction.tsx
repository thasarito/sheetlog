import type { ReimbursementSummary } from "../../lib/reimbursements";

export type ReimbursementActionProps = {
  summary: ReimbursementSummary;
  currency: string;
  isChecking: boolean;
  isError: boolean;
  needsOnlineVerification: boolean;
  onRetry: () => void;
  onReimburse: () => void;
};

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "—";
  }

  return amount.toLocaleString("en-US", {
    maximumFractionDigits: 12,
  });
}

export function ReimbursementAction({
  summary,
  currency,
  isChecking,
  isError,
  needsOnlineVerification,
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
    !hasCurrencyMismatch &&
    !isOverReimbursed &&
    hasKnownRemaining &&
    summary.remaining > 0;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Reimbursement balance</legend>
        <dl className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {[
            ["Confirmed", summary.confirmed],
            ["Queued", summary.queued],
            ["Remaining", summary.remaining],
          ].map(([label, amount]) => (
            <div key={label} className="flex flex-col">
              <dt>{label}</dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {currency} {formatAmount(amount as number)}
              </dd>
            </div>
          ))}
        </dl>
      </fieldset>

      {isChecking ? (
        <p className="text-[10px] text-muted-foreground">
          Checking reimbursements...
        </p>
      ) : isError ? (
        <p className="flex items-center gap-1 text-[10px] text-danger">
          Unable to check reimbursements.
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={onRetry}
          >
            Retry
          </button>
        </p>
      ) : hasCurrencyMismatch ? (
        <p className="text-[10px] text-danger">
          Currency mismatch in linked reimbursements
        </p>
      ) : isOverReimbursed ? (
        <p className="text-[10px] text-danger">
          Over-reimbursed by {currency} {formatAmount(summary.overReimbursed)}
        </p>
      ) : needsOnlineVerification ? (
        <p className="text-[10px] text-muted-foreground">
          Balance will be verified when online
        </p>
      ) : null}

      <button
        type="button"
        className="rounded-2xl border border-primary/40 bg-primary/10 px-3 py-3 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => {
          if (canReimburse) {
            onReimburse();
          }
        }}
        disabled={!canReimburse}
      >
        {isFullyReimbursed ? "Fully reimbursed" : "Reimburse"}
      </button>
    </div>
  );
}
