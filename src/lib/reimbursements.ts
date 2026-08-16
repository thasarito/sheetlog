import type {
  TransactionRecord,
  TransactionStatus,
  TransactionType,
} from "./types";

export const REIMBURSEMENT_CATEGORY = "Reimbursement";

export type ReimbursementSummary = {
  confirmed: number;
  queued: number;
  remaining: number;
  overReimbursed: number;
  currencyMismatchIds: string[];
};

export type ReimbursementLedgerRow = {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  reimbursesTransactionId?: string;
  status: TransactionStatus;
  sheetRow?: number;
};

const MONEY_PRECISION = 12;

function roundedAmount(amount: number): number {
  return Number(amount.toFixed(MONEY_PRECISION));
}

function addAmounts(total: number, amount: number): number {
  return roundedAmount(total + amount);
}

function emptySummary(): ReimbursementSummary {
  return {
    confirmed: 0,
    queued: 0,
    remaining: 0,
    overReimbursed: 0,
    currencyMismatchIds: [],
  };
}

function isLinkedIncome(
  row: ReimbursementLedgerRow,
  sourceId: string,
  excludeChildId?: string,
): boolean {
  return (
    row.id.length > 0 &&
    row.id !== excludeChildId &&
    row.type === "income" &&
    row.reimbursesTransactionId === sourceId &&
    Number.isFinite(row.amount)
  );
}

export function isReimbursableExpense(source: TransactionRecord): boolean {
  return (
    source.sheetRowValid !== false &&
    source.type === "expense" &&
    Number.isFinite(source.amount) &&
    source.amount > 0
  );
}

export function calculateReimbursementSummary(
  source: TransactionRecord,
  remoteRows: ReimbursementLedgerRow[],
  localRows: ReimbursementLedgerRow[],
  excludeChildId?: string,
): ReimbursementSummary {
  if (!isReimbursableExpense(source)) {
    return emptySummary();
  }

  const remoteById = new Map<string, ReimbursementLedgerRow>();
  for (const row of remoteRows) {
    if (isLinkedIncome(row, source.id, excludeChildId)) {
      remoteById.set(row.id, row);
    }
  }

  const queuedById = new Map<string, ReimbursementLedgerRow>();
  for (const row of localRows) {
    if (
      (row.status === "pending" || row.status === "error") &&
      isLinkedIncome(row, source.id, excludeChildId)
    ) {
      queuedById.set(row.id, row);
    }
  }

  let confirmed = 0;
  let queued = 0;
  const currencyMismatchIds = new Set<string>();

  for (const [id, row] of remoteById) {
    if (queuedById.has(id)) {
      continue;
    }
    if (row.currency !== source.currency) {
      currencyMismatchIds.add(id);
      continue;
    }
    confirmed = addAmounts(confirmed, row.amount);
  }

  for (const [id, row] of queuedById) {
    if (row.currency !== source.currency) {
      currencyMismatchIds.add(id);
      continue;
    }
    queued = addAmounts(queued, row.amount);
  }

  const reimbursed = addAmounts(confirmed, queued);
  const sourceAmount = roundedAmount(source.amount);

  return {
    confirmed,
    queued,
    remaining: roundedAmount(Math.max(0, sourceAmount - reimbursed)),
    overReimbursed: roundedAmount(Math.max(0, reimbursed - sourceAmount)),
    currencyMismatchIds: [...currencyMismatchIds].sort(),
  };
}

export function validateReimbursementAmount(
  amount: number,
  summary: ReimbursementSummary,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter a valid reimbursement amount";
  }

  if (
    !Number.isFinite(summary.remaining) ||
    roundedAmount(amount) > roundedAmount(summary.remaining)
  ) {
    return "Amount exceeds remaining reimbursement balance";
  }

  return null;
}
