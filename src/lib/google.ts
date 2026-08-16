import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from "./icons";
import type { ReimbursementLedgerRow } from "./reimbursements";
import {
  parseTransactionRow,
  serializeTransactionRowForUserEntered,
  TRANSACTION_HEADERS,
} from "./transactionRows";
import { QUICK_NOTE_HEADERS } from "./quickNoteSheet";
import { createCachedTransactionRecord } from "./transactionHistory";
import type {
  AccountItem,
  CategoryConfigWithMeta,
  TransactionHistorySnapshot,
  TransactionRecord,
} from "./types";

const SHEET_NAME = "SheetLog_DB";
const TAB_NAME = "Transactions";
const ACCOUNT_TAB = "Account";
const CATEGORY_TAB = "Category";
const QUICK_NOTE_TAB = "Quick Note";
const ACCOUNT_HEADER_ROW = ["Account", "Icon", "Color"];
const CATEGORY_HEADER_ROW = ["Type", "Category", "Icon", "Color"];

export class GoogleApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor({
    status,
    message,
    code,
    detail,
  }: {
    status: number;
    message: string;
    code?: string;
    detail?: string;
  }) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export class DuplicateTransactionIdError extends Error {
  readonly transactionId: string;
  readonly firstRow: number;
  readonly duplicateRow: number;

  constructor(
    transactionId: string,
    firstRow: number,
    duplicateRow: number,
  ) {
    super(
      `Duplicate transaction ID "${transactionId}" found in ${TAB_NAME}!K at rows ${firstRow} and ${duplicateRow}. Remove the duplicate row before syncing.`,
    );
    this.name = "DuplicateTransactionIdError";
    this.transactionId = transactionId;
    this.firstRow = firstRow;
    this.duplicateRow = duplicateRow;
  }
}

export class TransactionHistoryChangedError extends Error {
  constructor() {
    super(
      "Transactions changed while history was downloading. Retry the refresh.",
    );
    this.name = "TransactionHistoryChangedError";
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 401;
}

// Google Identity Services (GIS) client code removed in favor of @react-oauth/google

function parseGoogleErrorBody(body: string): {
  message?: string;
  code?: string;
  detail?: string;
} {
  const trimmed = body.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string; status?: string };
    };
    const error = parsed?.error;
    return {
      message: typeof error?.message === "string" ? error.message : undefined,
      code: typeof error?.status === "string" ? error.status : undefined,
      detail: trimmed,
    };
  } catch {
    return { detail: trimmed };
  }
}

export async function fetchWithAuth<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const parsed = parseGoogleErrorBody(errorText);
    const message = parsed.message ?? `HTTP ${response.status}`;
    console.error("Google API Error:", {
      status: response.status,
      message,
      detail: parsed.detail,
    });
    throw new GoogleApiError({
      status: response.status,
      message,
      code: parsed.code,
      detail: parsed.detail,
    });
  }

  return response.json() as Promise<T>;
}

export async function findExistingSheet(
  accessToken: string,
  folderId?: string | null
): Promise<string | null> {
  const folderFilter = folderId ? ` and '${folderId}' in parents` : "";
  const query = encodeURIComponent(
    `name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false${folderFilter}`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const data = await fetchWithAuth<{ files: Array<{ id: string }> }>(
    url,
    accessToken
  );
  return data.files?.[0]?.id ?? null;
}

export async function createSheet(accessToken: string): Promise<string> {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  const data = await fetchWithAuth<{ spreadsheetId: string }>(
    url,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        properties: { title: SHEET_NAME },
        sheets: [
          { properties: { title: TAB_NAME } },
          { properties: { title: ACCOUNT_TAB } },
          { properties: { title: CATEGORY_TAB } },
          { properties: { title: QUICK_NOTE_TAB } },
        ],
      }),
    }
  );

  await ensureHeaders(accessToken, data.spreadsheetId);
  await ensureAccountsHeaders(accessToken, data.spreadsheetId);
  await ensureCategoriesHeaders(accessToken, data.spreadsheetId);
  await ensureQuickNotesHeaders(accessToken, data.spreadsheetId);
  return data.spreadsheetId;
}

async function moveFileToFolder(
  accessToken: string,
  fileId: string,
  folderId: string
): Promise<void> {
  const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`;
  const metadata = await fetchWithAuth<{ parents?: string[] }>(
    metadataUrl,
    accessToken
  );
  const parents = metadata.parents ?? [];
  if (parents.length === 1 && parents[0] === folderId) {
    return;
  }
  const removeParents = parents
    .filter((parent) => parent !== folderId)
    .join(",");
  const params = new URLSearchParams({
    addParents: folderId,
    fields: "id,parents",
  });
  if (removeParents) {
    params.set("removeParents", removeParents);
  }
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`;
  await fetchWithAuth(url, accessToken, { method: "PATCH" });
}

export async function ensureHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A1:N1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [TRANSACTION_HEADERS] }),
  });
}

export async function ensureReimbursementHeader(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!L1:L1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [[TRANSACTION_HEADERS[11]]] }),
  });
}

export async function ensurePlaceHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!M1:N1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({
      values: [[...TRANSACTION_HEADERS.slice(12, 14)]],
    }),
  });
}

async function ensureAccountsHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${ACCOUNT_TAB}!A1:C1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [ACCOUNT_HEADER_ROW] }),
  });
}

async function ensureCategoriesHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CATEGORY_TAB}!A1:D1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [CATEGORY_HEADER_ROW] }),
  });
}

async function ensureQuickNotesHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${QUICK_NOTE_TAB}!A1:M1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [QUICK_NOTE_HEADERS] }),
  });
}

async function ensureAccountsSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const existing = await getSheetTabId(accessToken, spreadsheetId, ACCOUNT_TAB);
  if (existing === null) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await fetchWithAuth(url, accessToken, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: ACCOUNT_TAB } } }],
      }),
    });
  }
  await ensureAccountsHeaders(accessToken, spreadsheetId);
}

async function ensureCategoriesSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const existing = await getSheetTabId(
    accessToken,
    spreadsheetId,
    CATEGORY_TAB
  );
  if (existing === null) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await fetchWithAuth(url, accessToken, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: CATEGORY_TAB } } }],
      }),
    });
  }
  await ensureCategoriesHeaders(accessToken, spreadsheetId);
}

export async function ensureSheet(
  accessToken: string,
  folderId?: string | null
): Promise<string> {
  const existing = await findExistingSheet(accessToken, folderId);
  if (existing) {
    await ensureHeaders(accessToken, existing);
    await ensureAccountsSheet(accessToken, existing);
    await ensureCategoriesSheet(accessToken, existing);
    return existing;
  }
  const created = await createSheet(accessToken);
  if (folderId) {
    await moveFileToFolder(accessToken, created, folderId);
  }
  return created;
}

export async function getSheetTabId(
  accessToken: string,
  spreadsheetId: string,
  title: string = TAB_NAME
): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
  const data = await fetchWithAuth<{
    sheets: Array<{ properties: { sheetId: number; title: string } }>;
  }>(url, accessToken);
  const match = data.sheets.find((sheet) => sheet.properties.title === title);
  return match?.properties.sheetId ?? null;
}

export async function appendTransaction(
  accessToken: string,
  spreadsheetId: string,
  transaction: TransactionRecord
): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const values = [serializeTransactionRowForUserEntered(transaction)];

  const data = await fetchWithAuth<{ updates?: { updatedRange?: string } }>(
    url,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    }
  );

  const updatedRange = data.updates?.updatedRange;
  if (!updatedRange) {
    return null;
  }
  return parseRowFromRange(updatedRange);
}

export async function readTransactionIdMap(
  accessToken: string,
  spreadsheetId: string
): Promise<Map<string, number>> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!K2:K`;
  const data = await fetchWithAuth<{ values?: string[][] }>(url, accessToken);
  const map = new Map<string, number>();
  const values = data.values ?? [];
  for (let index = 0; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const rawValue = row[0];
    if (!rawValue) {
      continue;
    }
    const id = String(rawValue).trim();
    if (!id) {
      continue;
    }
    const existingRow = map.get(id);
    if (existingRow !== undefined) {
      throw new DuplicateTransactionIdError(
        id,
        existingRow,
        index + 2,
      );
    }
    map.set(id, index + 2);
  }
  return map;
}

export async function deleteRow(
  accessToken: string,
  spreadsheetId: string,
  sheetTabId: number,
  rowIndex: number
): Promise<void> {
  if (rowIndex <= 1) {
    throw new Error("Refusing to delete header row");
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await fetchWithAuth(url, accessToken, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetTabId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    }),
  });
}

export async function updateRow(
  accessToken: string,
  spreadsheetId: string,
  rowIndex: number,
  transaction: TransactionRecord
): Promise<void> {
  if (rowIndex <= 1) {
    throw new Error("Refusing to update header row");
  }

  const values = [serializeTransactionRowForUserEntered(transaction)];

  const range = `${TAB_NAME}!A${rowIndex}:N${rowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

function parseRowFromRange(range: string): number | null {
  const match = range.match(/!A(\d+):/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

const CATEGORY_TYPES = ["expense", "income", "transfer"] as const;

type CategoryType = (typeof CATEGORY_TYPES)[number];

function _normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of values) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function parseAccounts(rows: string[][]): AccountItem[] | null {
  const items: AccountItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = row[0]?.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const icon = row[1]?.trim() || undefined;
    const color = row[2]?.trim() || undefined;

    items.push({
      name,
      icon: icon || DEFAULT_ACCOUNT_ICON,
      color: color || DEFAULT_ACCOUNT_COLOR,
    });
  }

  return items.length > 0 ? items : null;
}

function parseCategories(rows: string[][]): CategoryConfigWithMeta | null {
  const result: CategoryConfigWithMeta = {
    expense: [],
    income: [],
    transfer: [],
  };
  const seen: Record<CategoryType, Set<string>> = {
    expense: new Set(),
    income: new Set(),
    transfer: new Set(),
  };

  for (const row of rows) {
    const rawType = row[0]?.trim().toLowerCase();
    const name = row[1]?.trim();
    if (!rawType || !name) {
      continue;
    }
    if (!CATEGORY_TYPES.includes(rawType as CategoryType)) {
      continue;
    }
    const type = rawType as CategoryType;
    const key = name.toLowerCase();
    if (seen[type].has(key)) {
      continue;
    }
    seen[type].add(key);

    const icon = row[2]?.trim() || undefined;
    const color = row[3]?.trim() || undefined;

    result[type].push({
      name,
      icon:
        icon || SUGGESTED_CATEGORY_ICONS[name] || DEFAULT_CATEGORY_ICONS[type],
      color:
        color ||
        SUGGESTED_CATEGORY_COLORS[name] ||
        DEFAULT_CATEGORY_COLORS[type],
    });
  }

  const hasAny =
    result.expense.length > 0 ||
    result.income.length > 0 ||
    result.transfer.length > 0;
  return hasAny ? result : null;
}

async function clearRange(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
  await fetchWithAuth(url, accessToken, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function readOnboardingConfig(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
} | null> {
  let accounts: AccountItem[] | null = null;
  let categories: CategoryConfigWithMeta | null = null;

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${ACCOUNT_TAB}!A2:C`;
    const data = await fetchWithAuth<{ values?: string[][] }>(url, accessToken);
    accounts = parseAccounts(data.values ?? []);
  } catch {
    accounts = null;
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CATEGORY_TAB}!A2:D`;
    const data = await fetchWithAuth<{ values?: string[][] }>(url, accessToken);
    categories = parseCategories(data.values ?? []);
  } catch {
    categories = null;
  }

  if (!accounts && !categories) {
    return null;
  }
  return {
    ...(accounts ? { accounts } : {}),
    ...(categories ? { categories } : {}),
  };
}

export async function writeOnboardingConfig(
  accessToken: string,
  spreadsheetId: string,
  updates: { accounts?: AccountItem[]; categories?: CategoryConfigWithMeta }
): Promise<void> {
  if (!updates.accounts && !updates.categories) {
    return;
  }

  if (updates.accounts) {
    // Normalize and dedupe accounts
    const seen = new Set<string>();
    const normalizedAccounts = updates.accounts.filter((item) => {
      const key = item.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await ensureAccountsSheet(accessToken, spreadsheetId);
    await clearRange(accessToken, spreadsheetId, `${ACCOUNT_TAB}!A2:C`);
    if (normalizedAccounts.length > 0) {
      const range = `${ACCOUNT_TAB}!A2:C${normalizedAccounts.length + 1}`;
      await fetchWithAuth(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            values: normalizedAccounts.map((item) => [
              item.name.trim(),
              item.icon || "",
              item.color || "",
            ]),
          }),
        }
      );
    }
  }

  if (updates.categories) {
    const rows: string[][] = [];
    (["expense", "income", "transfer"] as const).forEach((type) => {
      const seen = new Set<string>();
      updates.categories?.[type].forEach((item) => {
        const key = item.name.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push([type, item.name.trim(), item.icon || "", item.color || ""]);
      });
    });
    await ensureCategoriesSheet(accessToken, spreadsheetId);
    await clearRange(accessToken, spreadsheetId, `${CATEGORY_TAB}!A2:D`);
    if (rows.length > 0) {
      const range = `${CATEGORY_TAB}!A2:D${rows.length + 1}`;
      await fetchWithAuth(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({ values: rows }),
        }
      );
    }
  }
}

export async function listFolders(
  accessToken: string,
  parentId: string = "root"
): Promise<{ id: string; name: string }[]> {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&orderBy=name`;
  const data = await fetchWithAuth<{
    files: Array<{ id: string; name: string }>;
  }>(url, accessToken);
  return data.files ?? [];
}

export async function getRecentTransactions(
  accessToken: string,
  spreadsheetId: string,
  limit: number = 50
): Promise<TransactionRecord[]> {
  // 1. Get the number of rows (using column K as a proxy for data existence)
  const countUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!K2:K`;
  const countData = await fetchWithAuth<{ values?: string[][] }>(
    countUrl,
    accessToken
  );
  const totalRows = countData.values?.length ?? 0;

  if (totalRows === 0) {
    return [];
  }

  // 2. Calculate the range to fetch
  // Data starts at row 2. Last row index is totalRows + 1.
  const lastRowIndex = totalRows + 1;
  const startRowIndex = Math.max(2, lastRowIndex - limit + 1);
  const range = `${TAB_NAME}!A${startRowIndex}:N${lastRowIndex}`;

  // 3. Fetch the data
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const data = await fetchWithAuth<{ values?: unknown[][] }>(url, accessToken);
  const rows = data.values ?? [];

  // 4. Parse and reverse (newest first)
  return rows
    .map((row, index) => ({
      ...parseTransactionRow(row, startRowIndex + index),
      sheetId: spreadsheetId,
    }))
    .reverse();
}

type TransactionHistorySnapshotOptions = {
  chunkSize?: number;
  signal?: AbortSignal;
};

type TransactionHistoryBoundary = {
  dateValues: unknown[][];
  idValues: unknown[][];
  sourceLastRow: number;
};

async function readTransactionHistoryBoundary(
  accessToken: string,
  spreadsheetId: string,
  signal?: AbortSignal,
): Promise<TransactionHistoryBoundary> {
  const countUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!K2:K`;
  const countData = await fetchWithAuth<{ values?: unknown[][] }>(
    countUrl,
    accessToken,
    { signal },
  );
  // Column K is authoritative for stable IDs. Column A keeps older rows that
  // predate IDs visible, including legacy rows at the end of a Sheet.
  const legacyCountUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A2:A`;
  const legacyCountData = await fetchWithAuth<{ values?: unknown[][] }>(
    legacyCountUrl,
    accessToken,
    { signal },
  );
  const idValues = countData.values ?? [];
  const dateValues = legacyCountData.values ?? [];
  return {
    idValues,
    dateValues,
    sourceLastRow: Math.max(idValues.length, dateValues.length) + 1,
  };
}

function transactionHistoryBoundaryMatches(
  left: TransactionHistoryBoundary,
  right: TransactionHistoryBoundary,
): boolean {
  return (
    left.sourceLastRow === right.sourceLastRow &&
    JSON.stringify(left.idValues) === JSON.stringify(right.idValues) &&
    JSON.stringify(left.dateValues) === JSON.stringify(right.dateValues)
  );
}

function rowHasTransactionData(row: unknown[]): boolean {
  return row.some(
    (value) =>
      value !== null &&
      value !== undefined &&
      (typeof value !== "string" || value.trim().length > 0),
  );
}

async function downloadTransactionHistorySnapshot(
  accessToken: string,
  spreadsheetId: string,
  options: TransactionHistorySnapshotOptions,
): Promise<TransactionHistorySnapshot | null> {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 500));
  const capturedAt = new Date().toISOString();
  const startingBoundary = await readTransactionHistoryBoundary(
    accessToken,
    spreadsheetId,
    options.signal,
  );
  const { sourceLastRow } = startingBoundary;
  const records = [];
  const rowByRecordId = new Map<string, number>();
  let duplicateError: DuplicateTransactionIdError | null = null;

  for (let startRow = 2; startRow <= sourceLastRow; startRow += chunkSize) {
    const endRow = Math.min(sourceLastRow, startRow + chunkSize - 1);
    const range = `${TAB_NAME}!A${startRow}:N${endRow}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
    const data = await fetchWithAuth<{ values?: unknown[][] }>(
      url,
      accessToken,
      { signal: options.signal },
    );
    for (const [offset, row] of (data.values ?? []).entries()) {
      if (!rowHasTransactionData(row)) {
        continue;
      }
      const rowNumber = startRow + offset;
      const transaction = parseTransactionRow(row, rowNumber);
      const firstRow = rowByRecordId.get(transaction.id);
      if (firstRow !== undefined) {
        duplicateError ??= new DuplicateTransactionIdError(
          transaction.id,
          firstRow,
          rowNumber,
        );
        continue;
      }
      rowByRecordId.set(transaction.id, rowNumber);
      records.push(
        createCachedTransactionRecord(
          { ...transaction, sheetId: spreadsheetId },
          spreadsheetId,
          capturedAt,
        ),
      );
    }
  }

  const endingBoundary = await readTransactionHistoryBoundary(
    accessToken,
    spreadsheetId,
    options.signal,
  );
  if (!transactionHistoryBoundaryMatches(startingBoundary, endingBoundary)) {
    return null;
  }
  if (duplicateError) {
    throw duplicateError;
  }

  return {
    records,
    meta: {
      sheetId: spreadsheetId,
      capturedAt,
      sourceLastRow,
      rowCount: records.length,
    },
  };
}

export async function getTransactionHistorySnapshot(
  accessToken: string,
  spreadsheetId: string,
  options: TransactionHistorySnapshotOptions = {},
): Promise<TransactionHistorySnapshot> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await downloadTransactionHistorySnapshot(
      accessToken,
      spreadsheetId,
      options,
    );
    if (snapshot) {
      return snapshot;
    }
  }
  throw new TransactionHistoryChangedError();
}

export async function readTransactionById(
  accessToken: string,
  spreadsheetId: string,
  id: string
): Promise<TransactionRecord | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rowIndex = (
      await readTransactionIdMap(accessToken, spreadsheetId)
    ).get(id);
    if (rowIndex === undefined) {
      return null;
    }

    const range = `${TAB_NAME}!A${rowIndex}:N${rowIndex}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
    const data = await fetchWithAuth<{ values?: unknown[][] }>(url, accessToken);
    const row = data.values?.[0];
    if (!row) {
      continue;
    }

    const transaction = parseTransactionRow(row, rowIndex);
    if (transaction.id === id) {
      return {
        ...transaction,
        sheetId: spreadsheetId,
      };
    }
  }

  return null;
}

function finiteSheetAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export async function readLinkedReimbursements(
  accessToken: string,
  spreadsheetId: string,
  sourceId: string
): Promise<ReimbursementLedgerRow[]> {
  const params = new URLSearchParams();
  params.append("ranges", `${TAB_NAME}!B2:C`);
  params.append("ranges", `${TAB_NAME}!H2:L`);
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`;
  const data = await fetchWithAuth<{
    valueRanges?: Array<{ values?: unknown[][] }>;
  }>(url, accessToken);
  const typeAndAmountRows = data.valueRanges?.[0]?.values ?? [];
  const linkedFieldRows = data.valueRanges?.[1]?.values ?? [];
  const rowCount = Math.max(typeAndAmountRows.length, linkedFieldRows.length);
  const rows: ReimbursementLedgerRow[] = [];

  for (let offset = 0; offset < rowCount; offset += 1) {
    const [type, amountRaw] = typeAndAmountRows[offset] ?? [];
    const [currencyRaw, _account, _forValue, idRaw, relationRaw] =
      linkedFieldRows[offset] ?? [];
    const amount = finiteSheetAmount(amountRaw);
    const id = String(idRaw ?? "").trim();
    const relation = String(relationRaw ?? "").trim();

    if (
      type !== "income" ||
      amount === null ||
      id.length === 0 ||
      relation !== sourceId
    ) {
      continue;
    }

    rows.push({
      id,
      type,
      amount,
      currency: String(currencyRaw ?? "").trim(),
      reimbursesTransactionId: relation,
      status: "synced",
      sheetRow: offset + 2,
    });
  }

  return rows;
}
