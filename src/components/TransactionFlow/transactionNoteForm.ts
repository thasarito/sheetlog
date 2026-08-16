import { sameTransactionPlace } from "../../lib/transactionPlace";
import type {
  TransactionPlace,
  TransactionUpdateInput,
} from "../../lib/types";
import type { TransactionFormApi } from "./useTransactionForm";

export type ResolvedPlaceSelection = {
  displayName: string;
  placeId: string;
};

export function setManualTransactionNote(
  form: TransactionFormApi,
  value: string,
) {
  form.store.batch(() => {
    form.setFieldValue("note", value);
    if (!value.trim()) form.setFieldValue("place", undefined);
  });
}

export function clearTransactionNote(form: TransactionFormApi) {
  form.store.batch(() => {
    form.setFieldValue("note", "");
    form.setFieldValue("place", undefined);
  });
}

export function selectGooglePlace(
  form: TransactionFormApi,
  selection: ResolvedPlaceSelection,
) {
  form.store.batch(() => {
    form.setFieldValue("note", selection.displayName);
    form.setFieldValue("place", {
      provider: "google",
      placeId: selection.placeId.trim(),
    });
  });
}

export function replaceTransactionNote(
  form: TransactionFormApi,
  value: string,
) {
  form.store.batch(() => {
    form.setFieldValue("note", value);
    form.setFieldValue("place", undefined);
  });
}

export function clearTransactionPlace(form: TransactionFormApi) {
  form.setFieldValue("place", undefined);
}

export function buildPlaceUpdatePatch(
  original: TransactionPlace | undefined,
  current: TransactionPlace | undefined,
): Pick<TransactionUpdateInput, "place"> | Record<string, never> {
  return sameTransactionPlace(original, current)
    ? {}
    : { place: current ?? null };
}
