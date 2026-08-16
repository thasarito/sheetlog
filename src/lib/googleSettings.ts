import type { SettingsSection, SheetSettingsConfig } from './settingsSync';
import { encodeA1Range, fetchWithAuth } from './google';
import {
  normalizeAccounts,
  normalizeCategories,
  SettingsSectionValidationError,
} from './settingsSections';
import {
  parseQuickNoteRows,
  QUICK_NOTE_HEADERS,
  QuickNoteSheetValidationError,
  serializeQuickNoteRows,
} from './quickNoteSheet';
import type { TransactionType } from './types';

export type SheetSettingsSectionReadResult<Value> =
  | { status: 'ok'; present: boolean; value: Value }
  | { status: 'invalid'; present: true; error: string };

export interface SheetSettingsReadResult {
  accounts: SheetSettingsSectionReadResult<SheetSettingsConfig['accounts']>;
  categories: SheetSettingsSectionReadResult<SheetSettingsConfig['categories']>;
  quickNotes: SheetSettingsSectionReadResult<SheetSettingsConfig['quickNotes']>;
}

interface SheetProperties {
  sheetId?: unknown;
  title?: unknown;
  sheetType?: unknown;
  gridProperties?: {
    rowCount?: unknown;
    columnCount?: unknown;
  };
}

interface GridSheetProperties {
  sheetId: number;
  title: string;
  sheetType: 'GRID';
  gridProperties: {
    rowCount: number;
    columnCount: number;
  };
}

interface SheetsMetadataResponse {
  sheets?: Array<{ properties?: SheetProperties }>;
}

const SETTINGS_METADATA_FIELDS =
  'sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)))';

function emptyCategories(): SheetSettingsConfig['categories'] {
  return { expense: [], income: [], transfer: [] };
}

const ACCOUNT_HEADERS = ['Account', 'Icon', 'Color'] as const;
const CATEGORY_HEADERS = ['Type', 'Category', 'Icon', 'Color'] as const;

function sheetProperties(metadata: SheetsMetadataResponse): SheetProperties[] {
  if (!Array.isArray(metadata.sheets)) {
    return [];
  }
  return metadata.sheets.flatMap((sheet) =>
    sheet?.properties && typeof sheet.properties === 'object' ? [sheet.properties] : [],
  );
}

function validateGridSettingsTab(
  properties: SheetProperties,
  tabTitle: string,
): GridSheetProperties {
  if (properties.sheetType !== 'GRID') {
    throw new Error(`Settings tab "${tabTitle}" must be a GRID sheet.`);
  }
  if (
    typeof properties.sheetId !== 'number' ||
    !Number.isFinite(properties.sheetId) ||
    !Number.isInteger(properties.sheetId) ||
    properties.sheetId < 0
  ) {
    throw new Error(`Settings tab "${tabTitle}" has an invalid sheetId.`);
  }
  const rowCount = properties.gridProperties?.rowCount;
  const columnCount = properties.gridProperties?.columnCount;
  if (
    typeof rowCount !== 'number' ||
    !Number.isInteger(rowCount) ||
    rowCount <= 0 ||
    typeof columnCount !== 'number' ||
    !Number.isInteger(columnCount) ||
    columnCount <= 0
  ) {
    throw new Error(`Settings tab "${tabTitle}" has invalid grid dimensions.`);
  }
  return {
    sheetId: properties.sheetId,
    title: tabTitle,
    sheetType: 'GRID',
    gridProperties: { rowCount, columnCount },
  };
}

function nextAvailableSheetId(properties: readonly SheetProperties[]): number {
  const usedIds = new Set(
    properties.flatMap(({ sheetId }) =>
      typeof sheetId === 'number' && Number.isInteger(sheetId) && sheetId >= 0 ? [sheetId] : [],
    ),
  );
  let candidate = 0;
  while (usedIds.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

function trimmedCell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseAccountRows(rows: readonly (readonly unknown[])[]): SheetSettingsConfig['accounts'] {
  const accounts: Array<{ name: string; icon: string; color: string }> = [];
  const rowNumbers: number[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = row.slice(0, 3).map(trimmedCell);
    if (cells.every((cell) => cell.length === 0)) {
      return;
    }
    const [name, icon, color] = cells;
    rowNumbers.push(rowNumber);
    accounts.push({ name, icon, color });
  });

  return normalizeAccounts(accounts, {
    itemLabel: (index) => `Account row ${rowNumbers[index]}`,
  });
}

function isTransactionType(value: string): value is TransactionType {
  return value === 'expense' || value === 'income' || value === 'transfer';
}

function parseCategoryRows(
  rows: readonly (readonly unknown[])[],
): SheetSettingsConfig['categories'] {
  const categories: SheetSettingsConfig['categories'] = {
    expense: [],
    income: [],
    transfer: [],
  };
  const rowNumbers: Record<TransactionType, number[]> = {
    expense: [],
    income: [],
    transfer: [],
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = row.slice(0, 4).map(trimmedCell);
    if (cells.every((cell) => cell.length === 0)) {
      return;
    }
    const [rawType, name, icon, color] = cells;
    const type = rawType.toLowerCase();
    if (!isTransactionType(type)) {
      throw new SettingsSectionValidationError(
        `Category row ${rowNumber}: Type must be "expense", "income", or "transfer".`,
      );
    }
    rowNumbers[type].push(rowNumber);
    categories[type].push({ name, icon, color });
  });

  return normalizeCategories(categories, {
    itemLabel: (type, index) => `Category row ${rowNumbers[type][index]}`,
  });
}

function invalidSection(error: unknown): never {
  if (error instanceof SettingsSectionValidationError) {
    throw error;
  }
  throw error;
}

export async function readSheetSettingsConfig(
  accessToken: string,
  spreadsheetId: string,
): Promise<SheetSettingsReadResult> {
  const metadata = await fetchWithAuth<SheetsMetadataResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${encodeURIComponent(SETTINGS_METADATA_FIELDS)}`,
    accessToken,
  );
  const tabs = new Map(
    sheetProperties(metadata).flatMap((properties) =>
      typeof properties.title === 'string' ? [[properties.title, properties] as const] : [],
    ),
  );
  const accountTab = tabs.get('Account');
  const categoryTab = tabs.get('Category');
  const quickNoteTab = tabs.get('Quick Note');
  const accounts = accountTab
    ? await fetchWithAuth<{ values?: unknown[][] }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeA1Range('Account', 'A2:C')}`,
        accessToken,
      ).then(({ values }) => {
        try {
          return { status: 'ok' as const, present: true, value: parseAccountRows(values ?? []) };
        } catch (error) {
          if (error instanceof SettingsSectionValidationError) {
            return { status: 'invalid' as const, present: true as const, error: error.message };
          }
          return invalidSection(error);
        }
      })
    : ({
        status: 'ok',
        present: false,
        value: [] as SheetSettingsConfig['accounts'],
      } as const);

  const categories = categoryTab
    ? await fetchWithAuth<{ values?: unknown[][] }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeA1Range('Category', 'A2:D')}`,
        accessToken,
      ).then(({ values }) => {
        try {
          return { status: 'ok' as const, present: true, value: parseCategoryRows(values ?? []) };
        } catch (error) {
          if (error instanceof SettingsSectionValidationError) {
            return { status: 'invalid' as const, present: true as const, error: error.message };
          }
          return invalidSection(error);
        }
      })
    : ({ status: 'ok', present: false, value: emptyCategories() } as const);
  const quickNotes = quickNoteTab
    ? await fetchWithAuth<{ values?: unknown[][] }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeA1Range('Quick Note', 'A2:M')}`,
        accessToken,
      ).then(({ values }) => {
        try {
          return { status: 'ok' as const, present: true, value: parseQuickNoteRows(values ?? []) };
        } catch (error) {
          if (error instanceof QuickNoteSheetValidationError) {
            return { status: 'invalid' as const, present: true as const, error: error.message };
          }
          return invalidSection(error);
        }
      })
    : ({ status: 'ok', present: false, value: {} } as const);

  return {
    accounts,
    categories,
    quickNotes,
  };
}

export async function replaceSheetSettingsSection<Section extends SettingsSection>(
  accessToken: string,
  spreadsheetId: string,
  section: Section,
  value: SheetSettingsConfig[Section],
): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>> {
  const tabTitle =
    section === 'accounts' ? 'Account' : section === 'categories' ? 'Category' : 'Quick Note';
  const headers =
    section === 'accounts'
      ? ACCOUNT_HEADERS
      : section === 'categories'
        ? CATEGORY_HEADERS
        : QUICK_NOTE_HEADERS;
  const normalizedValue =
    section === 'accounts'
      ? normalizeAccounts(value)
      : section === 'categories'
        ? normalizeCategories(value)
        : value;
  const dataRows =
    section === 'accounts'
      ? (normalizedValue as SheetSettingsConfig['accounts']).map(({ name, icon, color }) => [
          name,
          icon,
          color,
        ])
      : section === 'categories'
        ? (['expense', 'income', 'transfer'] as const).flatMap((type) =>
            (normalizedValue as SheetSettingsConfig['categories'])[type].map(
              ({ name, icon, color }) => [type, name, icon, color],
            ),
          )
        : serializeQuickNoteRows(normalizedValue as SheetSettingsConfig['quickNotes']);
  const readRange = section === 'accounts' ? 'A1:C' : section === 'categories' ? 'A1:D' : 'A1:M';
  const rows = [[...headers], ...dataRows].map((row) => ({
    values: row.map((cell) => ({ userEnteredValue: { stringValue: cell } })),
  }));
  const requiredRowCount = rows.length;
  const requiredColumnCount = headers.length;

  const metadata = await fetchWithAuth<SheetsMetadataResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${encodeURIComponent(SETTINGS_METADATA_FIELDS)}`,
    accessToken,
  );
  const allSheetProperties = sheetProperties(metadata);
  const existingTargetTab = allSheetProperties.find(({ title }) => title === tabTitle);
  const targetTab = existingTargetTab
    ? validateGridSettingsTab(existingTargetTab, tabTitle)
    : {
        sheetId: nextAvailableSheetId(allSheetProperties),
        title: tabTitle,
        sheetType: 'GRID' as const,
        gridProperties: {
          rowCount: requiredRowCount,
          columnCount: requiredColumnCount,
        },
      };
  const existingRowCount = targetTab.gridProperties.rowCount;
  const existingColumnCount = targetTab.gridProperties.columnCount;
  const requests: unknown[] = [];
  if (!existingTargetTab) {
    requests.push({
      addSheet: {
        properties: {
          sheetId: targetTab.sheetId,
          title: tabTitle,
          gridProperties: {
            rowCount: requiredRowCount,
            columnCount: requiredColumnCount,
          },
        },
      },
    });
  }
  if (requiredRowCount > existingRowCount) {
    requests.push({
      appendDimension: {
        sheetId: targetTab.sheetId,
        dimension: 'ROWS',
        length: requiredRowCount - existingRowCount,
      },
    });
  }
  if (requiredColumnCount > existingColumnCount) {
    requests.push({
      appendDimension: {
        sheetId: targetTab.sheetId,
        dimension: 'COLUMNS',
        length: requiredColumnCount - existingColumnCount,
      },
    });
  }
  requests.push({
    updateCells: {
      range: {
        sheetId: targetTab.sheetId,
        startRowIndex: 0,
        endRowIndex: Math.max(existingRowCount, requiredRowCount),
        startColumnIndex: 0,
        endColumnIndex: requiredColumnCount,
      },
      rows,
      fields: 'userEnteredValue',
    },
  });
  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests,
      }),
    },
  );

  const readBack = await fetchWithAuth<{ values?: unknown[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeA1Range(tabTitle, readRange)}`,
    accessToken,
  );
  const [readBackHeader = [], ...readBackRows] = readBack.values ?? [];
  const headerMatches =
    readBackHeader.length === headers.length &&
    headers.every((header, index) => readBackHeader[index] === header);
  if (!headerMatches) {
    return {
      status: 'invalid',
      present: true,
      error: `Settings tab "${tabTitle}" header must be exactly: ${headers.join(' | ')}.`,
    };
  }
  try {
    return {
      status: 'ok',
      present: true,
      value:
        section === 'accounts'
          ? parseAccountRows(readBackRows)
          : section === 'categories'
            ? parseCategoryRows(readBackRows)
            : parseQuickNoteRows(readBackRows),
    } as SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>;
  } catch (error) {
    if (
      error instanceof SettingsSectionValidationError ||
      error instanceof QuickNoteSheetValidationError
    ) {
      return { status: 'invalid', present: true, error: error.message };
    }
    return invalidSection(error);
  }
}
