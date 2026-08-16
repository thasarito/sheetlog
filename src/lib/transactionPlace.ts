import type {
  PlaceUpdateIntent,
  TransactionInput,
  TransactionPlace,
  TransactionRecord,
  TransactionUpdateInput,
} from "./types";

const owns = (value: object, key: PropertyKey) =>
  Object.hasOwn(value, key);

export class InvalidTransactionPlaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransactionPlaceError";
  }
}

export function hasOwnPlaceUpdate(input: TransactionUpdateInput): boolean {
  return owns(input, "place");
}

export function normalizeTransactionPlace(value: unknown): TransactionPlace {
  if (!value || typeof value !== "object") {
    throw new InvalidTransactionPlaceError("Invalid place metadata");
  }
  const candidate = value as { provider?: unknown; placeId?: unknown };
  const placeId =
    typeof candidate.placeId === "string" ? candidate.placeId.trim() : "";
  if (candidate.provider !== "google" || !placeId) {
    throw new InvalidTransactionPlaceError("Invalid place metadata");
  }
  return { provider: "google", placeId };
}

export function parseSheetTransactionPlace(
  note: unknown,
  provider: unknown,
  placeId: unknown,
): TransactionPlace | undefined {
  if (typeof note !== "string" || !note.trim()) return undefined;
  if (String(provider ?? "").trim() !== "google") return undefined;
  const normalizedId = String(placeId ?? "").trim();
  return normalizedId
    ? { provider: "google", placeId: normalizedId }
    : undefined;
}

export function normalizeTransactionInput<T extends TransactionInput>(
  input: T,
): T {
  if (input.place === undefined) {
    const withoutPlace = { ...input };
    delete withoutPlace.place;
    return withoutPlace;
  }
  const place = normalizeTransactionPlace(input.place);
  if (!input.note?.trim()) {
    throw new InvalidTransactionPlaceError(
      "Place metadata requires a nonblank note",
    );
  }
  return { ...input, place };
}

export function applyTransactionUpdate<T extends TransactionRecord>(
  current: T,
  input: TransactionUpdateInput,
): T {
  const hasPlacePatch = hasOwnPlaceUpdate(input);
  const requestedPlace = input.place;
  const ordinaryFields = { ...input };
  delete ordinaryFields.place;
  const next = { ...current, ...ordinaryFields } as T;

  let place = current.place;
  if (hasPlacePatch) {
    if (requestedPlace === undefined) {
      throw new InvalidTransactionPlaceError("Invalid place metadata");
    }
    place =
      requestedPlace === null
        ? undefined
        : normalizeTransactionPlace(requestedPlace);
  }
  if (!next.note?.trim()) {
    if (hasPlacePatch && requestedPlace !== null) {
      throw new InvalidTransactionPlaceError(
        "Place metadata requires a nonblank note",
      );
    }
    place = undefined;
  }
  if (place) next.place = place;
  else delete next.place;
  return next;
}

export function composePlaceUpdateIntent(
  previous: PlaceUpdateIntent | undefined,
  input: TransactionUpdateInput,
): PlaceUpdateIntent {
  if (hasOwnPlaceUpdate(input)) {
    if (input.place === undefined) {
      throw new InvalidTransactionPlaceError("Invalid place metadata");
    }
    return input.place === null ? "clear" : "set";
  }
  if (owns(input, "note") && !input.note?.trim()) return "clear";
  return previous === "set" || previous === "clear" ? previous : "preserve";
}

export function withoutTransactionPlace<T extends TransactionRecord>(
  record: T,
): T {
  const next = { ...record };
  delete next.place;
  return next;
}

export function sameTransactionPlace(
  left?: TransactionPlace,
  right?: TransactionPlace,
): boolean {
  return (
    left?.provider === right?.provider && left?.placeId === right?.placeId
  );
}
