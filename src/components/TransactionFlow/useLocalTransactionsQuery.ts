import { useQuery } from "@tanstack/react-query";
import { db } from "../../lib/db";
import { transactionQueryKeys } from "./transactionQueryKeys";

export function useLocalTransactionsQuery() {
  return useQuery({
    queryKey: transactionQueryKeys.local,
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const rows = await db.transactions
        .where("status")
        .anyOf("pending", "error")
        .toArray();

      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });
}
