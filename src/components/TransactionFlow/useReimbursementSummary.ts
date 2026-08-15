import { useQuery } from "@tanstack/react-query";
import { useConnectivity, useSession, useWorkspace } from "../../app/providers";
import {
  readLinkedReimbursements as realReadLinkedReimbursements,
} from "../../lib/google";
import {
  IS_DEV_MODE,
  readLinkedReimbursements as mockReadLinkedReimbursements,
} from "../../lib/mock";
import {
  calculateReimbursementSummary,
  type ReimbursementLedgerRow,
  type ReimbursementSummary,
} from "../../lib/reimbursements";
import type { TransactionRecord } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useLocalTransactionsQuery } from "./useLocalTransactionsQuery";

const readLinkedReimbursements = IS_DEV_MODE
  ? mockReadLinkedReimbursements
  : realReadLinkedReimbursements;

const EMPTY_SUMMARY: ReimbursementSummary = {
  confirmed: 0,
  queued: 0,
  remaining: 0,
  overReimbursed: 0,
  currencyMismatchIds: [],
};

export type ReimbursementSummaryQueryResult = {
  summary: ReimbursementSummary;
  isChecking: boolean;
  isError: boolean;
  retry: () => Promise<unknown>;
  needsOnlineVerification: boolean;
};

function isLocalOnly(source: TransactionRecord | null): boolean {
  return Boolean(
    source &&
      (source.status === "pending" || source.status === "error") &&
      !source.sheetId,
  );
}

export function useReimbursementSummary({
  source,
  excludeChildId,
}: {
  source: TransactionRecord | null;
  excludeChildId?: string;
}): ReimbursementSummaryQueryResult {
  const { accessToken } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const localQuery = useLocalTransactionsQuery();
  const sourceId = source?.id ?? "";
  const sourceIsLocalOnly = isLocalOnly(source);
  const canCheckRemote = Boolean(
    source &&
      !sourceIsLocalOnly &&
      isOnline &&
      accessToken &&
      sheetId,
  );

  const remoteQuery = useQuery<ReimbursementLedgerRow[]>({
    queryKey: transactionQueryKeys.reimbursement(sheetId, sourceId),
    enabled: canCheckRemote,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      if (!accessToken || !sheetId || !source) {
        return [];
      }

      return readLinkedReimbursements(accessToken, sheetId, source.id);
    },
  });

  const cachedRemoteIsKnown = remoteQuery.data !== undefined;
  const remoteRows = sourceIsLocalOnly ? [] : (remoteQuery.data ?? []);
  const localRows = localQuery.data;
  const localLedgerIsChecking = Boolean(source && localQuery.isFetching);
  const localLedgerIsError = Boolean(source && localQuery.isError);
  const localLedgerIsReady = Boolean(
    source &&
      !localLedgerIsChecking &&
      !localLedgerIsError &&
      localRows !== undefined,
  );
  const summary = source && localLedgerIsReady && localRows
    ? calculateReimbursementSummary(
        source,
        remoteRows,
        localRows,
        excludeChildId,
      )
    : EMPTY_SUMMARY;

  async function retry() {
    const retries: Promise<unknown>[] = [];
    if (localQuery.isError) {
      retries.push(localQuery.refetch());
    }
    if (canCheckRemote && remoteQuery.isError) {
      retries.push(remoteQuery.refetch());
    }
    await Promise.all(retries);
  }

  return {
    summary,
    isChecking:
      localLedgerIsChecking ||
      (canCheckRemote && remoteQuery.isFetching),
    isError:
      localLedgerIsError ||
      (canCheckRemote && remoteQuery.isError),
    retry,
    needsOnlineVerification: Boolean(
      source &&
        !sourceIsLocalOnly &&
        !isOnline &&
        !cachedRemoteIsKnown,
    ),
  };
}
