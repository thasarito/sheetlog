import {
  REIMBURSEMENT_CATEGORY,
} from "../../lib/reimbursements";
import type { TransactionRecord } from "../../lib/types";
import type { TransactionFormValues } from "./transactionSchema";

export type TransactionFlowMode =
  | { kind: "create" }
  | { kind: "edit"; transaction: TransactionRecord }
  | { kind: "reimburse"; source: TransactionRecord };

export function reimbursementFieldsLocked(
  mode: TransactionFlowMode,
): boolean {
  return (
    mode.kind === "reimburse" ||
    (mode.kind === "edit" &&
      Boolean(mode.transaction.reimbursesTransactionId))
  );
}

export function getReimbursementFormDefaults(
  source: TransactionRecord,
  remaining: number,
  now = new Date(),
): TransactionFormValues {
  return {
    type: "income",
    category: REIMBURSEMENT_CATEGORY,
    amount: String(remaining),
    currency: source.currency,
    account: source.account,
    forValue: source.for,
    dateObject: now,
    note: source.note?.trim() ? source.note : source.category,
    place: undefined,
  };
}
