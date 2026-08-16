import type { SettingsSection, SheetSettingsConfig } from './settingsSync';
import { fetchWithAuth } from './google';
import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from './icons';
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
  sheetId: number;
  title: string;
  gridProperties: {
    rowCount: number;
    columnCount: number;
  };
}

const SETTINGS_METADATA_FIELDS =
  'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))';

const EMPTY_CATEGORIES: SheetSettingsConfig['categories'] = {
  expense: [],
  income: [],
  transfer: [],
};

const ACCOUNT_HEADERS = ['Account', 'Icon', 'Color'] as const;
const CATEGORY_HEADERS = ['Type', 'Category', 'Icon', 'Color'] as const;

class SettingsSectionValidationError extends Error {}

function trimmedCell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseAccountRows(rows: readonly (readonly unknown[])[]): SheetSettingsConfig['accounts'] {
  const accounts: SheetSettingsConfig['accounts'] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = row.slice(0, 3).map(trimmedCell);
    if (cells.every((cell) => cell.length === 0)) {
      return;
    }
    const [name, icon, color] = cells;
    if (!name) {
      throw new SettingsSectionValidationError(`Account row ${rowNumber}: Name is required.`);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new SettingsSectionValidationError(
        `Account row ${rowNumber}: Duplicate name "${name}".`,
      );
    }
    seen.add(key);
    accounts.push({
      name,
      icon: icon || DEFAULT_ACCOUNT_ICON,
      color: color || DEFAULT_ACCOUNT_COLOR,
    });
  });

  return accounts;
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
  const seen: Record<TransactionType, Set<string>> = {
    expense: new Set(),
    income: new Set(),
    transfer: new Set(),
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
    if (!name) {
      throw new SettingsSectionValidationError(`Category row ${rowNumber}: Name is required.`);
    }
    const key = name.toLowerCase();
    if (seen[type].has(key)) {
      throw new SettingsSectionValidationError(
        `Category row ${rowNumber}: Duplicate ${type} name "${name}".`,
      );
    }
    seen[type].add(key);
    categories[type].push({
      name,
      icon: icon || SUGGESTED_CATEGORY_ICONS[name] || DEFAULT_CATEGORY_ICONS[type],
      color: color || SUGGESTED_CATEGORY_COLORS[name] || DEFAULT_CATEGORY_COLORS[type],
    });
  });

  return categories;
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
  const metadata = await fetchWithAuth<{
    sheets?: Array<{ properties: SheetProperties }>;
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${encodeURIComponent(SETTINGS_METADATA_FIELDS)}`,
    accessToken,
  );
  const tabs = new Map(
    (metadata.sheets ?? []).map(({ properties }) => [properties.title, properties]),
  );
  const accountTab = tabs.get('Account');
  const categoryTab = tabs.get('Category');
  const quickNoteTab = tabs.get('Quick Note');
  const accounts = accountTab
    ? await fetchWithAuth<{ values?: unknown[][] }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Account!A2:C`,
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
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Category!A2:D`,
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
    : ({ status: 'ok', present: false, value: EMPTY_CATEGORIES } as const);
  const quickNotes = quickNoteTab
    ? await fetchWithAuth<{ values?: unknown[][] }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Quick Note!A2:M`,
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
  const dataRows =
    section === 'accounts'
      ? (value as SheetSettingsConfig['accounts']).map(({ name, icon, color }) => [
          name,
          icon ?? '',
          color ?? '',
        ])
      : section === 'categories'
        ? (['expense', 'income', 'transfer'] as const).flatMap((type) =>
            (value as SheetSettingsConfig['categories'])[type].map(({ name, icon, color }) => [
              type,
              name,
              icon ?? '',
              color ?? '',
            ]),
          )
        : serializeQuickNoteRows(value as SheetSettingsConfig['quickNotes']);
  const readRange =
    section === 'accounts'
      ? 'Account!A2:C'
      : section === 'categories'
        ? 'Category!A2:D'
        : 'Quick Note!A2:M';

  const metadata = await fetchWithAuth<{
    sheets?: Array<{ properties: SheetProperties }>;
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${encodeURIComponent(SETTINGS_METADATA_FIELDS)}`,
    accessToken,
  );
  let targetTab = metadata.sheets
    ?.map(({ properties }) => properties)
    .find(({ title }) => title === tabTitle);
  if (!targetTab) {
    const creation = await fetchWithAuth<{
      replies?: Array<{
        addSheet?: { properties?: SheetProperties };
      }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: tabTitle } } }],
        }),
      },
    );
    targetTab = creation.replies?.[0]?.addSheet?.properties;
    if (!targetTab) {
      const refreshedMetadata = await fetchWithAuth<{
        sheets?: Array<{ properties: SheetProperties }>;
      }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${encodeURIComponent(SETTINGS_METADATA_FIELDS)}`,
        accessToken,
      );
      targetTab = refreshedMetadata.sheets
        ?.map(({ properties }) => properties)
        .find(({ title }) => title === tabTitle);
    }
    if (!targetTab) {
      throw new Error(`Created ${tabTitle} tab metadata was not returned by Google Sheets.`);
    }
  }

  const rows = [[...headers], ...dataRows].map((row) => ({
    values: row.map((cell) => ({ userEnteredValue: { stringValue: cell } })),
  }));
  const requiredRowCount = rows.length;
  const requiredColumnCount = headers.length;
  const existingRowCount = targetTab.gridProperties.rowCount;
  const existingColumnCount = targetTab.gridProperties.columnCount;
  const requests: unknown[] = [];
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${readRange}`,
    accessToken,
  );
  try {
    return {
      status: 'ok',
      present: true,
      value:
        section === 'accounts'
          ? parseAccountRows(readBack.values ?? [])
          : section === 'categories'
            ? parseCategoryRows(readBack.values ?? [])
            : parseQuickNoteRows(readBack.values ?? []),
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
