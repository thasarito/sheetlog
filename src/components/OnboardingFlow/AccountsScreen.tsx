import React from "react";
import { Wallet, X, Plus } from "lucide-react";
import { OnboardingLayout } from "./OnboardingLayout";
import type { ScreenMeta } from "./types";
import { cn } from "../../lib/utils";

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
    <OnboardingLayout
      title="Set up accounts"
      subtitle="Add your bank accounts, credit cards, or cash wallets."
      stepCurrent={meta.stepNumber}
      stepTotal={meta.totalSteps}
    >
      <div className="space-y-6 pt-2">
        <div className="flex gap-3">
          <input
            type="text"
            className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder="e.g. Chase Sapphire"
            value={accountInput}
            onChange={(event) => onAccountInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void onAddAccount();
            }}
          />
          <button
            type="button"
            className="flex items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={onAddAccount}
            disabled={!accountInput.trim()}
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground bg-muted/30 rounded-3xl border border-dashed border-border/60">
            <Wallet className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">No accounts added yet.</p>
            <p className="text-xs opacity-70">Add at least one to continue.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={account}
                className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/60 shadow-sm transition hover:border-primary/30 hover:shadow-md animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-full">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-base">{account}</span>
                </div>
                <button
                  type="button"
                  className="p-2 -mr-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                  onClick={() => onRemoveAccount(account)}
                  aria-label={`Remove ${account}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-blue-200 transition hover:bg-primary/90 disabled:opacity-60"
          onClick={onContinue}
          disabled={isSaving || accounts.length === 0}
        >
          {isSaving ? "Saving..." : "Continue"}
        </button>
      </div>
    </OnboardingLayout>
  );
}
