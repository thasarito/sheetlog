import { DEFAULT_CATEGORIES } from "./categories";
import { STORAGE_KEYS } from "./constants";
import { db, type SheetLogDB } from "./db";
import { getOnboardingStateKey } from "./settings";
import type {
  BootstrapPayload,
  BootstrapTransaction,
} from "./bootstrapPayload";
import {
  createLocalWorkspaceMetadata,
  type LocalWorkspaceMetadata,
  writeLocalWorkspace,
} from "./localWorkspace";
import type { OnboardingState, TransactionRecord } from "./types";

const SELECTED_APP_ID_KEY = "selectedAppId";
const IMPORT_MARKER_PREFIX = "tinyWinBootstrapImported:";
const IMPORTED_RECEIPT_KEY = "tinyWinImportedReceipt";
const RECOVERY_KEY = "tinyWinLocalWorkspaceRecovery";

export type ImportedBootstrapReceipt = {
  bootstrapId: string;
  transaction: BootstrapTransaction;
};

type ImportOptions = {
  database?: SheetLogDB;
  storage?: Storage;
};

function storageOrThrow(storage?: Storage): Storage {
  const resolved =
    storage ??
    (typeof window === "undefined" ? undefined : window.localStorage);
  if (!resolved) throw new Error("Local storage is unavailable");
  return resolved;
}

function onboardingFromPayload(payload: BootstrapPayload): OnboardingState {
  return {
    sheetFolderId: null,
    accounts: [
      {
        name: payload.setup.account.name,
        icon: "Wallet",
        color: payload.setup.account.color,
      },
    ],
    accountsConfirmed: true,
    categories: {
      expense: DEFAULT_CATEGORIES.expense.map((item) => ({ ...item })),
      income: DEFAULT_CATEGORIES.income.map((item) => ({ ...item })),
      transfer: DEFAULT_CATEGORIES.transfer.map((item) => ({ ...item })),
    },
    categoriesConfirmed: true,
    analyticsBaseCurrency: payload.setup.currency,
    analyticsBaseCurrencyUpdatedAt: payload.issuedAt,
    analyticsBigSpendingThreshold: null,
  };
}

function transactionFromPayload(
  payload: BootstrapPayload,
  metadata: LocalWorkspaceMetadata,
): TransactionRecord {
  return {
    ...payload.transaction,
    status: "pending",
    createdAt: payload.issuedAt,
    updatedAt: payload.issuedAt,
    targetSheetId: metadata.sheetId,
    targetUserId: metadata.userId,
  };
}

export async function importBootstrapPayload(
  payload: BootstrapPayload,
  options: ImportOptions = {},
): Promise<{ metadata: LocalWorkspaceMetadata; imported: boolean }> {
  const database = options.database ?? db;
  const storage = storageOrThrow(options.storage);
  const metadata = createLocalWorkspaceMetadata({
    bootstrapId: payload.bootstrapId,
    countryCode: payload.setup.countryCode,
    currency: payload.setup.currency,
    createdAt: payload.issuedAt,
  });
  const markerKey = `${IMPORT_MARKER_PREFIX}${payload.bootstrapId}`;
  const imported = await database.transaction(
    "rw",
    database.settings,
    database.transactions,
    async () => {
      const existingMarker = await database.settings.get(markerKey);
      if (existingMarker) return false;
      const onboarding = onboardingFromPayload(payload);
      if (!(await database.transactions.get(payload.transaction.id))) {
        await database.transactions.add(
          transactionFromPayload(payload, metadata),
        );
      }
      const updatedAt = new Date().toISOString();
      await database.settings.bulkPut([
        {
          key: getOnboardingStateKey(null),
          value: JSON.stringify(onboarding),
          updatedAt,
        },
        { key: SELECTED_APP_ID_KEY, value: "money", updatedAt },
        {
          key: IMPORTED_RECEIPT_KEY,
          value: JSON.stringify({
            bootstrapId: payload.bootstrapId,
            transaction: payload.transaction,
          } satisfies ImportedBootstrapReceipt),
          updatedAt,
        },
        {
          key: RECOVERY_KEY,
          value: JSON.stringify(metadata),
          updatedAt,
        },
        { key: markerKey, value: payload.transaction.id, updatedAt },
      ]);
      return true;
    },
  );
  writeLocalWorkspace(metadata, storage);
  storage.setItem(STORAGE_KEYS.LAST_ACCOUNT, payload.setup.account.name);
  storage.setItem(STORAGE_KEYS.LAST_CURRENCY, payload.setup.currency);
  return { metadata, imported };
}

export async function recoverLocalWorkspaceFromImport(
  database: SheetLogDB = db,
  storage?: Storage,
): Promise<LocalWorkspaceMetadata | null> {
  const record = await database.settings.get(RECOVERY_KEY);
  if (!record) return null;
  try {
    const metadata = JSON.parse(record.value) as LocalWorkspaceMetadata;
    writeLocalWorkspace(metadata, storageOrThrow(storage));
    return metadata;
  } catch {
    return null;
  }
}

export async function readImportedBootstrapReceipt(
  database: SheetLogDB = db,
): Promise<ImportedBootstrapReceipt | null> {
  const record = await database.settings.get(IMPORTED_RECEIPT_KEY);
  if (!record) return null;
  try {
    const parsed = JSON.parse(record.value) as ImportedBootstrapReceipt;
    return parsed?.bootstrapId && parsed.transaction?.id ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearImportedBootstrapReceipt(
  database: SheetLogDB = db,
): Promise<void> {
  await database.settings.delete(IMPORTED_RECEIPT_KEY);
}
