export const transactionQueryKeys = {
  recent: (sheetId: string | null, limit = 50) =>
    ["recentTransactions", sheetId, limit] as const,
  local: ["localTransactions"] as const,
  localForSheet: (
    sheetId: string | null,
    userId: string | null,
  ) => ["localTransactions", sheetId, userId] as const,
  reimbursements: ["reimbursementSummary"] as const,
  reimbursement: (sheetId: string | null, sourceId: string) =>
    ["reimbursementSummary", sheetId, sourceId] as const,
  transaction: (sheetId: string | null, id: string) =>
    ["transactionById", sheetId, id] as const,
  // Keep fallback beneath the remote-only key so one prefix invalidation refreshes both.
  transactionFallback: (sheetId: string | null, id: string) =>
    ["transactionById", sheetId, id, "fallback"] as const,
};
