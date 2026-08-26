import { isCurrency, type Currency } from "./currencies";
import type {
  TransactionInput,
  TransactionPlace,
  TransactionType,
} from "./types";

export type BootstrapAccount = {
  institutionId: string;
  name: string;
  mark: string;
  color: string;
};

export type BootstrapSetup = {
  countryCode: string;
  currency: Currency;
  account: BootstrapAccount;
};

export type BootstrapTransaction = TransactionInput & { id: string };

export type BootstrapStageInput = {
  setup: BootstrapSetup;
  transaction: TransactionInput;
};

export type BootstrapPayload = {
  version: 1;
  bootstrapId: string;
  issuedAt: string;
  expiresAt: string;
  setup: BootstrapSetup;
  transaction: BootstrapTransaction;
};

const TRANSACTION_TYPES = new Set<TransactionType>([
  "expense",
  "income",
  "transfer",
]);
const MAX_AMOUNT = 1_000_000_000_000;
const MAX_BOOTSTRAP_LIFETIME_MS = 31 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  maximumLength: number,
  minimumLength = 1,
): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= minimumLength &&
    value.length <= maximumLength
  );
}

function validateAccount(value: unknown): BootstrapAccount | null {
  if (!isRecord(value)) return null;
  if (
    !boundedString(value.institutionId, 128) ||
    !boundedString(value.name, 128) ||
    !boundedString(value.mark, 12) ||
    !boundedString(value.color, 7) ||
    !/^#[0-9a-f]{6}$/i.test(value.color)
  ) {
    return null;
  }
  return {
    institutionId: value.institutionId,
    name: value.name,
    mark: value.mark,
    color: value.color,
  };
}

function validateSetup(value: unknown): BootstrapSetup | null {
  if (!isRecord(value)) return null;
  const account = validateAccount(value.account);
  if (
    !boundedString(value.countryCode, 2) ||
    !/^[A-Z]{2}$/.test(value.countryCode) ||
    !isCurrency(value.currency) ||
    !account
  ) {
    return null;
  }
  return {
    countryCode: value.countryCode,
    currency: value.currency,
    account,
  };
}

function validatePlace(value: unknown): TransactionPlace | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (value.provider !== "google" || !boundedString(value.placeId, 256)) {
    return null;
  }
  return { provider: "google", placeId: value.placeId };
}

function validateTransaction(
  value: unknown,
  requireId: boolean,
): BootstrapTransaction | TransactionInput | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const place = validatePlace(value.place);
  if (
    (requireId && !boundedString(value.id, 128)) ||
    typeof type !== "string" ||
    !TRANSACTION_TYPES.has(type as TransactionType) ||
    typeof value.amount !== "number" ||
    !Number.isFinite(value.amount) ||
    value.amount <= 0 ||
    value.amount > MAX_AMOUNT ||
    !isCurrency(value.currency) ||
    !boundedString(value.account, 128) ||
    !boundedString(value.for, 128) ||
    !boundedString(value.category, 128) ||
    !boundedString(value.date, 64) ||
    !Number.isFinite(Date.parse(value.date)) ||
    (value.note !== undefined && !boundedString(value.note, 500, 0)) ||
    (value.reimbursesTransactionId !== undefined &&
      !boundedString(value.reimbursesTransactionId, 128)) ||
    place === null
  ) {
    return null;
  }
  const transaction: TransactionInput = {
    type: type as TransactionType,
    amount: value.amount,
    currency: value.currency,
    account: value.account,
    for: value.for,
    category: value.category,
    date: value.date,
    ...(value.note ? { note: value.note } : {}),
    ...(value.reimbursesTransactionId
      ? { reimbursesTransactionId: value.reimbursesTransactionId }
      : {}),
    ...(place ? { place } : {}),
  };
  return requireId
    ? { id: value.id as string, ...transaction }
    : transaction;
}

export function validateBootstrapStageInput(
  value: unknown,
): BootstrapStageInput | null {
  if (!isRecord(value)) return null;
  const setup = validateSetup(value.setup);
  const transaction = validateTransaction(value.transaction, false);
  if (!setup || !transaction) return null;
  if (setup.currency !== transaction.currency) return null;
  if (setup.account.name !== transaction.account) return null;
  return { setup, transaction };
}

export function validateBootstrapPayload(
  value: unknown,
  now = Date.now(),
): BootstrapPayload | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const setup = validateSetup(value.setup);
  const transaction = validateTransaction(value.transaction, true);
  if (
    !setup ||
    !transaction ||
    !boundedString(value.bootstrapId, 128) ||
    !boundedString(value.issuedAt, 64) ||
    !boundedString(value.expiresAt, 64)
  ) {
    return null;
  }
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    issuedAt > now + 60_000 ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_BOOTSTRAP_LIFETIME_MS ||
    setup.currency !== transaction.currency ||
    setup.account.name !== transaction.account
  ) {
    return null;
  }
  return {
    version: 1,
    bootstrapId: value.bootstrapId,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    setup,
    transaction: transaction as BootstrapTransaction,
  };
}
