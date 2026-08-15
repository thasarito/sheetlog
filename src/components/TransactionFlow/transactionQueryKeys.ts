export const transactionQueryKeys = {
  recent: (sheetId: string | null, limit = 50) =>
    ["recentTransactions", sheetId, limit] as const,
  local: ["localTransactions"] as const,
  reimbursements: ["reimbursementSummary"] as const,
  reimbursement: (sheetId: string | null, sourceId: string) =>
    ["reimbursementSummary", sheetId, sourceId] as const,
  transaction: (sheetId: string | null, id: string) =>
    ["transactionById", sheetId, id] as const,
};
