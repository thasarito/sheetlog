"use client";

import React from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { TransactionType } from "../../lib/types";

export type ReceiptStatus = "idle" | "loading" | "success" | "error";

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
  status: ReceiptStatus;
  message?: string;
};

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export function StepReceipt({
  type,
  category,
  amount,
  currency,
  account,
  forValue,
  dateObject,
  note,
  status,
  message,
}: StepReceiptProps) {
  const normalizedStatus = status === "idle" ? "loading" : status;
  const amountLabel = amount ? amount : "0";
  const statusTitle =
    normalizedStatus === "loading"
      ? "Saving transaction"
      : normalizedStatus === "success"
        ? "Saved"
        : "Save failed";
  const statusDescription =
    normalizedStatus === "loading"
      ? "Hang tight while we log this entry."
      : normalizedStatus === "success"
        ? "Transaction added to your ledger."
        : message || "Check your connection and try again.";
  const Icon =
    normalizedStatus === "success"
      ? CheckCircle2
      : normalizedStatus === "error"
        ? XCircle
        : Loader2;
  const iconClassName =
    normalizedStatus === "loading"
      ? "h-4 w-4 animate-spin text-muted-foreground"
      : normalizedStatus === "success"
        ? "h-4 w-4 text-success"
        : "h-4 w-4 text-danger";
  const accountLabel = type === "transfer" ? "From" : "Account";
  const forLabel = type === "transfer" ? "To" : "For";

  return (
    <div className="flex min-h-[100dvh] flex-col gap-6">
      <div className="rounded-3xl border border-border/70 bg-surface-2/80 p-4 shadow-inner">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-card">
            <Icon className={iconClassName} />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {statusTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {statusDescription}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Summary
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              Amount
            </dt>
            <dd className="text-base font-semibold text-foreground">
              {amountLabel} {currency}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              Type
            </dt>
            <dd className="text-foreground">{TYPE_LABELS[type]}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              Category
            </dt>
            <dd className="text-foreground">{category}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              {accountLabel}
            </dt>
            <dd className="text-foreground">{account}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              {forLabel}
            </dt>
            <dd className="text-foreground">{forValue || "—"}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              Date
            </dt>
            <dd className="text-foreground">
              {format(dateObject, "MMM d, yyyy h:mm a")}
            </dd>
          </div>
          <div className="col-span-2 space-y-1">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              Note
            </dt>
            <dd className="text-muted-foreground">{note || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
