export const transactionQueryKeys = {
  recent: (sheetId: string | null, userId: string | null, limit = 50) =>
    ["recentTransactions", sheetId, userId, limit] as const,
  local: ["localTransactions"] as const,
  localForSheet: (
    sheetId: string | null,
    userId: string | null,
  ) => ["localTransactions", sheetId, userId] as const,
  reimbursements: ["reimbursementSummary"] as const,
  reimbursement: (
    sheetId: string | null,
    userId: string | null,
    sourceId: string,
  ) => ["reimbursementSummary", sheetId, userId, sourceId] as const,
  transaction: (
    sheetId: string | null,
    userId: string | null,
    id: string,
  ) => ["transactionById", sheetId, userId, id] as const,
  // Keep fallback beneath the remote-only key so one prefix invalidation refreshes both.
  transactionFallback: (
    sheetId: string | null,
    userId: string | null,
    id: string,
  ) => ["transactionById", sheetId, userId, id, "fallback"] as const,
};
