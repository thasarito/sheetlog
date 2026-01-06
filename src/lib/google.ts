import type { CategoryConfigWithMeta, TransactionRecord, AccountItem, CategoryItem } from "./types";
import {
  SUGGESTED_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_ACCOUNT_COLOR,
} from "./icons";

const SHEET_NAME = "SheetLog_DB";
const TAB_NAME = "Transactions";
const ACCOUNT_TAB = "Account";
const CATEGORY_TAB = "Category";
const HEADER_ROW = [
  "Date",
  "Type",
  "Amount",
  "Category",
  "Note",
  "Timestamp",
  "Device/Source",
  "Currency",
  "Account",
  "For",
  "Id",
];
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

async function fetchWithAuth<T>(
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
        ],
      }),
    }
  );

  await ensureHeaders(accessToken, data.spreadsheetId);
  await ensureAccountsHeaders(accessToken, data.spreadsheetId);
  await ensureCategoriesHeaders(accessToken, data.spreadsheetId);
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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A1:K1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: [HEADER_ROW] }),
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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  let note = transaction.note ?? "";
  let currency = transaction.currency ?? "";
  if (!currency && note) {
    const match = note.match(/^\[([A-Z]{3})\]\s*/);
    if (match) {
      currency = match[1];
      note = note.slice(match[0].length);
    }
  }
  const values = [
    [
      transaction.date,
      transaction.type,
      transaction.amount,
      transaction.category,
      note,
      transaction.createdAt,
      "PWA",
      currency,
      transaction.account ?? "",
      transaction.for ?? "",
      transaction.id,
    ],
  ];

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
    if (!id || map.has(id)) {
      continue;
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

function parseRowFromRange(range: string): number | null {
  const match = range.match(/!A(\d+):/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

const CATEGORY_TYPES = ["expense", "income", "transfer"] as const;

type CategoryType = (typeof CATEGORY_TYPES)[number];

function normalizeStringList(values: string[]): string[] {
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
      icon: icon || SUGGESTED_CATEGORY_ICONS[name] || DEFAULT_CATEGORY_ICONS[type],
      color: color || SUGGESTED_CATEGORY_COLORS[name] || DEFAULT_CATEGORY_COLORS[type],
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
): Promise<{ accounts?: AccountItem[]; categories?: CategoryConfigWithMeta } | null> {
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
      updates.categories![type].forEach((item) => {
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
