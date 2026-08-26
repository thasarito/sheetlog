import { useState } from "react";
import type { ImportedBootstrapReceipt } from "../../lib/bootstrapImport";
import { PlayfulSuccessArt } from "./PlayfulMascot";

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
    <main className="tiny-win-playful">
      <div className="tiny-win-playful-screen tiny-win-success-layout">
        <PlayfulSuccessArt />

        <section className="tiny-win-copy">
          <p className="tiny-win-eyebrow">Installed workspace</p>
          <h1 className="tiny-win-title">Nice. Your logging home is ready!</h1>
          <p className="tiny-win-lead">
            Your first transaction is saved in this installed SheetLog. The
            rest of onboarding is already complete.
          </p>
        </section>

        <section
          aria-label="Imported transaction"
          className="tiny-win-transaction-card text-left"
        >
          <div className="tiny-win-transaction-meta">
            <span className="min-w-0">
              <strong>{transaction.category}</strong>
              <small>
                {transaction.account} · {transaction.type}
              </small>
            </span>
            <span className="tiny-win-ready-pill">Saved</span>
          </div>
          <p className="tiny-win-transaction-amount">
            {amountLabel(receipt)}
          </p>
        </section>

        <div className="tiny-win-summary-grid">
          <div className="tiny-win-summary-card">
            <span>Account</span>
            <strong>{transaction.account}</strong>
          </div>
          <div className="tiny-win-summary-card">
            <span>Currency</span>
            <strong>{transaction.currency}</strong>
          </div>
          <div className="tiny-win-summary-card">
            <span>Category</span>
            <strong>{transaction.category}</strong>
          </div>
        </div>

        <button
          type="button"
          data-playful-pressable="true"
          disabled={isContinuing}
          onClick={() => void continueLogging()}
          className="tiny-win-primary-button"
        >
          {isContinuing ? "Opening SheetLog…" : "Continue logging →"}
        </button>
      </div>
    </main>
  );
}
