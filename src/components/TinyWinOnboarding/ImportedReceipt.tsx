import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ImportedBootstrapReceipt } from "../../lib/bootstrapImport";

function amountLabel(receipt: ImportedBootstrapReceipt): string {
  const { transaction } = receipt;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: transaction.currency,
      maximumFractionDigits: 2,
    }).format(transaction.amount);
  } catch {
    return `${transaction.currency} ${transaction.amount}`;
  }
}

export function ImportedReceipt({
  receipt,
  onContinue,
}: {
  receipt: ImportedBootstrapReceipt;
  onContinue: () => void | Promise<void>;
}) {
  const [isContinuing, setIsContinuing] = useState(false);
  const { transaction } = receipt;

  const continueLogging = async () => {
    if (isContinuing) return;
    setIsContinuing(true);
    try {
      await onContinue();
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto bg-background px-5 pb-safe-offset-6 pt-safe-offset-5 text-foreground">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <section className="relative z-10 my-auto text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-primary text-primary-foreground">
          <Check className="h-9 w-9" strokeWidth={3} />
        </div>
        <p className="mt-7 text-[10px] font-black uppercase tracking-[0.18em] text-primary">Imported safely</p>
        <h1 className="mx-auto mt-2 max-w-[330px] text-[clamp(2.1rem,10vw,2.9rem)] font-black leading-[0.98] tracking-[-0.06em]">
          Your first transaction is saved.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-5 text-muted-foreground">
          SheetLog created your local workspace and skipped the rest of onboarding.
        </p>

        <section
          aria-label="Imported transaction"
          className="mt-7 overflow-hidden rounded-[28px] border border-border bg-card p-5 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-black">{transaction.category}</p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {transaction.account} · {transaction.type === "expense" ? "Expense" : transaction.type}
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-black text-success">
              <Sparkles className="h-3 w-3" /> Saved
            </span>
          </div>
          <p className="mt-7 text-[clamp(2.6rem,13vw,3.4rem)] font-black leading-none tracking-[-0.065em] tabular-nums">
            {amountLabel(receipt)}
          </p>
          {transaction.note ? (
            <p className="mt-4 truncate text-[11px] text-muted-foreground">{transaction.note}</p>
          ) : null}
        </section>

        <button
          type="button"
          disabled={isContinuing}
          onClick={() => void continueLogging()}
          className="mt-5 h-14 w-full rounded-[19px] bg-primary px-5 text-[14px] font-black text-primary-foreground transition active:scale-[0.985] disabled:opacity-60"
        >
          {isContinuing ? "Opening SheetLog…" : "Continue logging"}
        </button>
      </section>
    </main>
  );
}
