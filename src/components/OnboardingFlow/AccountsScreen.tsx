import React from "react";
import { Wallet, X } from "lucide-react";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenMeta } from "./types";

type AccountsScreenProps = {
  meta: ScreenMeta;
  accountInput: string;
  accounts: string[];
  isSaving: boolean;
  onAccountInputChange: (value: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (name: string) => void;
  onContinue: () => void;
};

export function AccountsScreen({
  meta,
  accountInput,
  accounts,
  isSaving,
  onAccountInputChange,
  onAddAccount,
  onRemoveAccount,
  onContinue,
}: AccountsScreenProps) {
  return (
    <ScreenFrame
      {...meta}
      title="Set up accounts"
      subtitle="Add your bank accounts, cards, or wallets."
      icon={<Wallet className="h-5 w-5" />}
      footer={
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          onClick={onContinue}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Continue"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-surface-2/80 p-2">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="e.g. Chase Checking"
              value={accountInput}
              onChange={(event) => onAccountInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void onAddAccount();
              }}
            />
            <button
              type="button"
              className="rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-60"
              onClick={onAddAccount}
              disabled={!accountInput.trim()}
            >
              Add
            </button>
          </div>
        </div>
        {accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No accounts yet. Add at least one to continue.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {accounts.map((account) => (
              <div
                key={account}
                className="flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-foreground shadow-sm"
              >
                <span>{account}</span>
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition hover:text-foreground"
                  onClick={() => onRemoveAccount(account)}
                  aria-label={`Remove ${account}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScreenFrame>
  );
}
