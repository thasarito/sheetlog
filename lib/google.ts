import type { TransactionRecord } from './types';

const SHEET_NAME = 'SheetLog_DB';
const TAB_NAME = 'Transactions';
const HEADER_ROW = ['Date', 'Type', 'Amount', 'Category', 'Tags', 'Note', 'Timestamp', 'Device/Source'];
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

export async function findExistingSheet(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(
    `name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
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
      sheets: [{ properties: { title: TAB_NAME } }]
    })
  });

  await ensureHeaders(accessToken, data.spreadsheetId);
  return data.spreadsheetId;
}

export async function ensureHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A1:H1?valueInputOption=RAW`;
  await fetchWithAuth(url, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: [HEADER_ROW] })
  });
}

export async function ensureSheet(accessToken: string): Promise<string> {
  const existing = await findExistingSheet(accessToken);
  if (existing) {
    await ensureHeaders(accessToken, existing);
    return existing;
  }
  return createSheet(accessToken);
}

export async function getSheetTabId(accessToken: string, spreadsheetId: string): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
  const data = await fetchWithAuth<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>(
    url,
    accessToken
  );
  const match = data.sheets.find((sheet) => sheet.properties.title === TAB_NAME);
  return match?.properties.sheetId ?? null;
}

export async function appendTransaction(
  accessToken: string,
  spreadsheetId: string,
  transaction: TransactionRecord
): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${TAB_NAME}!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const values = [
    [
      transaction.date,
      transaction.type,
      transaction.amount,
      transaction.category,
      transaction.tags.join(', '),
      transaction.note ?? '',
      transaction.createdAt,
      'PWA'
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
