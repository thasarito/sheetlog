import type { CategoryConfig, TransactionRecord } from './types';

const SHEET_NAME = 'SheetLog_DB';
const TAB_NAME = 'Transactions';
const ACCOUNT_TAB = 'Account';
const CATEGORY_TAB = 'Category';
const HEADER_ROW = [
  'Date',
  'Type',
  'Amount',
  'Category',
  'Tags',
  'Note',
  'Timestamp',
  'Device/Source',
  'Currency',
  'Account',
  'For'
];
const ACCOUNT_HEADER_ROW = ['Account'];
const CATEGORY_HEADER_ROW = ['Type', 'Category'];
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

let scriptPromise: Promise<void> | null = null;

function loadScriptOnce(): Promise<void> {
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity script'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function requestAccessToken(clientId: string): Promise<string> {
  await loadScriptOnce();
  return new Promise((resolve, reject) => {
    const google = window.google as any;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity not available'));
      return;
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('No access token received'));
          return;
        }
        resolve(response.access_token);
      }
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function fetchWithAuth<T>(url: string, accessToken: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    const detail = errorText ? ` ${errorText}` : '';
    throw new Error(`HTTP ${response.status}:${detail}`);
  }

  return response.json() as Promise<T>;
}

export async function findExistingSheet(accessToken: string, folderId?: string | null): Promise<string | null> {
  const folderFilter = folderId ? ` and '${folderId}' in parents` : '';
  const query = encodeURIComponent(
    `name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false${folderFilter}`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const data = await fetchWithAuth<{ files: Array<{ id: string }> }>(url, accessToken);
  return data.files?.[0]?.id ?? null;
}

export async function createSheet(accessToken: string): Promise<string> {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets';
  const data = await fetchWithAuth<{ spreadsheetId: string }>(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: SHEET_NAME },
      sheets: [
        { properties: { title: TAB_NAME } },
        { properties: { title: ACCOUNT_TAB } },
        { properties: { title: CATEGORY_TAB } }
      ]
    })
  });

  await ensureHeaders(accessToken, data.spreadsheetId);
  await ensureAccountsHeaders(accessToken, data.spreadsheetId);
  await ensureCategoriesHeaders(accessToken, data.spreadsheetId);
  return data.spreadsheetId;
}

async function moveFileToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
  const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`;
  const metadata = await fetchWithAuth<{ parents?: string[] }>(metadataUrl, accessToken);
  const parents = metadata.parents ?? [];
  if (parents.length === 1 && parents[0] === folderId) {
    return;
  }
  const removeParents = parents.filter((parent) => parent !== folderId).join(',');
  const params = new URLSearchParams({ addParents: folderId, fields: 'id,parents' });
  if (removeParents) {
    params.set('removeParents', removeParents);
  }
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`;
  await fetchWithAuth(url, accessToken, { method: 'PATCH' });
}

export async function ensureHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A1:K1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: [HEADER_ROW] })
  });
}

async function ensureAccountsHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${ACCOUNT_TAB}!A1:A1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: [ACCOUNT_HEADER_ROW] })
  });
}

async function ensureCategoriesHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CATEGORY_TAB}!A1:B1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: [CATEGORY_HEADER_ROW] })
  });
}

async function ensureAccountsSheet(accessToken: string, spreadsheetId: string): Promise<void> {
  const existing = await getSheetTabId(accessToken, spreadsheetId, ACCOUNT_TAB);
  if (existing === null) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await fetchWithAuth(url, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: ACCOUNT_TAB } } }]
      })
    });
  }
  await ensureAccountsHeaders(accessToken, spreadsheetId);
}

async function ensureCategoriesSheet(accessToken: string, spreadsheetId: string): Promise<void> {
  const existing = await getSheetTabId(accessToken, spreadsheetId, CATEGORY_TAB);
  if (existing === null) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await fetchWithAuth(url, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: CATEGORY_TAB } } }]
      })
    });
  }
  await ensureCategoriesHeaders(accessToken, spreadsheetId);
}

export async function ensureSheet(accessToken: string, folderId?: string | null): Promise<string> {
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
  const data = await fetchWithAuth<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>(
    url,
    accessToken
  );
  const match = data.sheets.find((sheet) => sheet.properties.title === title);
  return match?.properties.sheetId ?? null;
}

export async function appendTransaction(
  accessToken: string,
  spreadsheetId: string,
  transaction: TransactionRecord
): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  let note = transaction.note ?? '';
  let currency = transaction.currency ?? '';
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
      transaction.tags.join(', '),
      note,
      transaction.createdAt,
      'PWA',
      currency,
      transaction.account ?? '',
      transaction.for ?? ''
    ]
  ];

  const data = await fetchWithAuth<{ updates?: { updatedRange?: string } }>(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({ values })
  });

  const updatedRange = data.updates?.updatedRange;
  if (!updatedRange) {
    return null;
  }
  return parseRowFromRange(updatedRange);
}

export async function deleteRow(
  accessToken: string,
  spreadsheetId: string,
  sheetTabId: number,
  rowIndex: number
): Promise<void> {
  if (rowIndex <= 1) {
    throw new Error('Refusing to delete header row');
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await fetchWithAuth(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetTabId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }
      ]
    })
  });
}

function parseRowFromRange(range: string): number | null {
  const match = range.match(/!A(\d+):/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

const CATEGORY_TYPES = ['expense', 'income', 'transfer'] as const;

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

function normalizeCategoryConfig(categories: CategoryConfig): CategoryConfig {
  return {
    expense: normalizeStringList(categories.expense),
    income: normalizeStringList(categories.income),
    transfer: normalizeStringList(categories.transfer)
  };
}

function parseAccounts(rows: string[][]): string[] | null {
  const values = rows
    .map((row) => row[0] ?? '')
    .map((value) => value.trim())
    .filter(Boolean);
  const normalized = normalizeStringList(values);
  return normalized.length > 0 ? normalized : null;
}

function parseCategories(rows: string[][]): CategoryConfig | null {
  const result: CategoryConfig = {
    expense: [],
    income: [],
    transfer: []
  };
  const seen: Record<CategoryType, Set<string>> = {
    expense: new Set(),
    income: new Set(),
    transfer: new Set()
  };

  for (const row of rows) {
    const rawType = row[0]?.trim().toLowerCase();
    const rawValue = row[1]?.trim();
    if (!rawType || !rawValue) {
      continue;
    }
    if (!CATEGORY_TYPES.includes(rawType as CategoryType)) {
      continue;
    }
    const type = rawType as CategoryType;
    const key = rawValue.toLowerCase();
    if (seen[type].has(key)) {
      continue;
    }
    seen[type].add(key);
    result[type].push(rawValue);
  }

  const hasAny =
    result.expense.length > 0 ||
    result.income.length > 0 ||
    result.transfer.length > 0;
  return hasAny ? result : null;
}

async function clearRange(accessToken: string, spreadsheetId: string, range: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
  await fetchWithAuth(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function readOnboardingConfig(
  accessToken: string,
  spreadsheetId: string
): Promise<{ accounts?: string[]; categories?: CategoryConfig } | null> {
  let accounts: string[] | null = null;
  let categories: CategoryConfig | null = null;

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${ACCOUNT_TAB}!A2:A`;
    const data = await fetchWithAuth<{ values?: string[][] }>(url, accessToken);
    accounts = parseAccounts(data.values ?? []);
  } catch {
    accounts = null;
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CATEGORY_TAB}!A2:B`;
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
    ...(categories ? { categories } : {})
  };
}

export async function writeOnboardingConfig(
  accessToken: string,
  spreadsheetId: string,
  updates: { accounts?: string[]; categories?: CategoryConfig }
): Promise<void> {
  if (!updates.accounts && !updates.categories) {
    return;
  }

  if (updates.accounts) {
    const normalizedAccounts = normalizeStringList(updates.accounts);
    await ensureAccountsSheet(accessToken, spreadsheetId);
    await clearRange(accessToken, spreadsheetId, `${ACCOUNT_TAB}!A2:A`);
    if (normalizedAccounts.length > 0) {
      const range = `${ACCOUNT_TAB}!A2:A${normalizedAccounts.length + 1}`;
      await fetchWithAuth(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
        accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({ values: normalizedAccounts.map((item) => [item]) })
        }
      );
    }
  }

  if (updates.categories) {
    const normalizedCategories = normalizeCategoryConfig(updates.categories);
    const rows: string[][] = [];
    (['expense', 'income', 'transfer'] as const).forEach((type) => {
      normalizedCategories[type].forEach((category) => {
        rows.push([type, category]);
      });
    });
    await ensureCategoriesSheet(accessToken, spreadsheetId);
    await clearRange(accessToken, spreadsheetId, `${CATEGORY_TAB}!A2:B`);
    if (rows.length > 0) {
      const range = `${CATEGORY_TAB}!A2:B${rows.length + 1}`;
      await fetchWithAuth(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
        accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({ values: rows })
        }
      );
    }
  }
}
