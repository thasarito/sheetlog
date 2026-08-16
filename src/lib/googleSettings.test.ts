import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSheet, GoogleApiError } from './google';
import { readSheetSettingsConfig, replaceSheetSettingsSection } from './googleSettings';
import {
  readSheetSettingsConfig as readMockSheetSettingsConfig,
  replaceSheetSettingsSection as replaceMockSheetSettingsSection,
} from './mock/mockGoogle';
import { clearMockData } from './mock/mockStorage';
import { QUICK_NOTE_HEADERS } from './quickNoteSheet';

const ACCESS_TOKEN = 'access-token';
const SHEET_ID = 'sheet-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function settingsMetadata(
  ...sheets: Array<{
    sheetId: number;
    title: string;
    rowCount?: number;
    columnCount?: number;
  }>
) {
  return {
    sheets: sheets.map(({ sheetId, title, rowCount = 20, columnCount = 13 }) => ({
      properties: {
        sheetId,
        title,
        gridProperties: { rowCount, columnCount },
      },
    })),
  };
}

function requestAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

describe('Google settings Sheet reads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('discovers tabs once, reads only present sections, and distinguishes missing from empty', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          sheets: [
            {
              properties: {
                sheetId: 11,
                title: 'Account',
                gridProperties: { rowCount: 20, columnCount: 3 },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID)).resolves.toEqual({
      accounts: { status: 'ok', present: true, value: [] },
      categories: {
        status: 'ok',
        present: false,
        value: { expense: [], income: [], transfer: [] },
      },
      quickNotes: { status: 'ok', present: false, value: {} },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id?fields=sheets(properties(sheetId%2Ctitle%2CgridProperties(rowCount%2CcolumnCount)))',
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Account!A2:C',
    ]);
  });

  it('parses account rows with trimming and current icon/color defaults', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsMetadata({ sheetId: 11, title: 'Account' })))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [' Cash ', '', ''],
            [],
            ['Card', 'CreditCard', '#123456'],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.accounts).toEqual({
      status: 'ok',
      present: true,
      value: [
        { name: 'Cash', icon: 'Wallet', color: '#6366f1' },
        { name: 'Card', icon: 'CreditCard', color: '#123456' },
      ],
    });
  });

  it.each([
    {
      name: 'a nonblank row without a name',
      rows: [['Cash'], ['', 'Wallet']],
      error: 'Account row 3: Name is required.',
    },
    {
      name: 'case-insensitive duplicate names',
      rows: [['Cash'], [], [' cash ']],
      error: 'Account row 4: Duplicate name "cash".',
    },
  ])('rejects the entire account section for $name', async ({ rows, error }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsMetadata({ sheetId: 11, title: 'Account' })))
      .mockResolvedValueOnce(jsonResponse({ values: rows }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.accounts).toEqual({ status: 'invalid', present: true, error });
  });

  it('parses category rows with per-type duplicates and current suggestions/defaults', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsMetadata({ sheetId: 12, title: 'Category' })))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [' expense ', ' Dining Out ', '', ''],
            ['income', 'Salary'],
            ['transfer', 'Custom'],
            ['expense', 'Shared'],
            ['income', 'Shared', 'Star', '#abcdef'],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.categories).toEqual({
      status: 'ok',
      present: true,
      value: {
        expense: [
          { name: 'Dining Out', icon: 'Utensils', color: '#f97316' },
          { name: 'Shared', icon: 'Tag', color: '#f97316' },
        ],
        income: [
          { name: 'Salary', icon: 'BadgeDollarSign', color: '#10b981' },
          { name: 'Shared', icon: 'Star', color: '#abcdef' },
        ],
        transfer: [{ name: 'Custom', icon: 'ArrowLeftRight', color: '#3b82f6' }],
      },
    });
  });

  it.each([
    {
      name: 'an invalid type',
      rows: [['purchase', 'Food']],
      error: 'Category row 2: Type must be "expense", "income", or "transfer".',
    },
    {
      name: 'a nonblank row without a name',
      rows: [['expense', '', 'Tag']],
      error: 'Category row 2: Name is required.',
    },
    {
      name: 'a case-insensitive duplicate within one type',
      rows: [
        ['expense', 'Food'],
        ['income', 'Food'],
        ['EXPENSE', ' food '],
      ],
      error: 'Category row 4: Duplicate expense name "food".',
    },
  ])('rejects the entire category section for $name', async ({ rows, error }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsMetadata({ sheetId: 12, title: 'Category' })))
      .mockResolvedValueOnce(jsonResponse({ values: rows }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.categories).toEqual({ status: 'invalid', present: true, error });
  });

  it('round-trips structured Quick Note rows and preserves empty targets', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsMetadata({ sheetId: 13, title: 'Quick Note' })))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [
              'default',
              'expense',
              '',
              'note',
              '1',
              'coffee',
              'Coffee',
              'Coffee run',
              '=SUM(A1:A2)',
              '120',
              'THB',
              'Cash',
              'Me',
            ],
            ['category', 'transfer', 'Savings', 'empty'],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.quickNotes).toEqual({
      status: 'ok',
      present: true,
      value: {
        'default:expense': [
          {
            id: 'coffee',
            icon: 'Coffee',
            label: 'Coffee run',
            note: '=SUM(A1:A2)',
            amount: '120',
            currency: 'THB',
            account: 'Cash',
            forValue: 'Me',
          },
        ],
        'transfer:Savings': [],
      },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Quick Note!A2:M',
    );
  });

  it('keeps valid sections when Quick Note rows are malformed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          settingsMetadata(
            { sheetId: 11, title: 'Account' },
            { sheetId: 12, title: 'Category' },
            { sheetId: 13, title: 'Quick Note' },
          ),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [['Cash']] }))
      .mockResolvedValueOnce(jsonResponse({ values: [['expense', 'Dining Out']] }))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [['default', 'expense', '', 'note', '6', 'id', 'Coffee', 'Coffee']],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result.accounts).toMatchObject({ status: 'ok', present: true });
    expect(result.categories).toMatchObject({ status: 'ok', present: true });
    expect(result.quickNotes).toEqual({
      status: 'invalid',
      present: true,
      error: 'Quick Note row 2: Position must be an integer from 1 to 5.',
    });
  });

  it('returns complete empty values for all present empty tabs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          settingsMetadata(
            { sheetId: 11, title: 'Account' },
            { sheetId: 12, title: 'Category' },
            { sheetId: 13, title: 'Quick Note' },
          ),
        ),
      )
      .mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchMock);

    const result = await readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    expect(result).toEqual({
      accounts: { status: 'ok', present: true, value: [] },
      categories: {
        status: 'ok',
        present: true,
        value: { expense: [], income: [], transfer: [] },
      },
      quickNotes: { status: 'ok', present: true, value: {} },
    });
    expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Account!A2:C',
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Category!A2:D',
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Quick Note!A2:M',
    ]);
  });

  it.each([
    { status: 401, code: 'UNAUTHENTICATED', message: 'Token expired' },
    { status: 429, code: 'RESOURCE_EXHAUSTED', message: 'Quota exhausted' },
  ])('propagates Google API failure $status', async ({ status, code, message }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message, status: code } }, status),
    );
    vi.stubGlobal('fetch', fetchMock);

    const failure = readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);

    await expect(failure).rejects.toBeInstanceOf(GoogleApiError);
    await expect(failure).rejects.toMatchObject({
      status,
      code,
      message,
    });
  });

  it('propagates raw network failures while reading a present range', async () => {
    const networkError = new TypeError('Failed to fetch');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsMetadata({ sheetId: 11, title: 'Account' })))
      .mockRejectedValueOnce(networkError);
    vi.stubGlobal('fetch', fetchMock);

    await expect(readSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID)).rejects.toBe(networkError);
  });
});

describe('Google settings Sheet creation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates the exact four tabs and initializes the Quick Note header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ spreadsheetId: SHEET_ID }))
      .mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createSheet(ACCESS_TOKEN)).resolves.toBe(SHEET_ID);

    const [createUrl, createInit] = requestAt(fetchMock, 0);
    expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    expect(JSON.parse(String(createInit.body)).sheets).toEqual([
      { properties: { title: 'Transactions' } },
      { properties: { title: 'Account' } },
      { properties: { title: 'Category' } },
      { properties: { title: 'Quick Note' } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [quickNoteUrl, quickNoteInit] = requestAt(fetchMock, 4);
    expect(quickNoteUrl).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Quick Note!A1:M1?valueInputOption=RAW',
    );
    expect(JSON.parse(String(quickNoteInit.body))).toEqual({ values: [QUICK_NOTE_HEADERS] });
  });
});

describe('Google settings Sheet replacement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('atomically replaces the full Account grid with literal cells and returns the read-back winner', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          settingsMetadata({ sheetId: 11, title: 'Account', rowCount: 5, columnCount: 3 }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ replies: [{}] }))
      .mockResolvedValueOnce(jsonResponse({ values: [['Remote winner', 'Wallet', '#6366f1']] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await replaceSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'accounts', [
      { name: '=Local', icon: '+Wallet', color: '@indigo' },
      { name: 'Bank', icon: 'Banknote', color: '#123456' },
    ]);

    expect(result).toEqual({
      status: 'ok',
      present: true,
      value: [{ name: 'Remote winner', icon: 'Wallet', color: '#6366f1' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [batchUrl, batchInit] = requestAt(fetchMock, 1);
    expect(batchUrl).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id:batchUpdate',
    );
    expect(batchInit.method).toBe('POST');
    expect(JSON.parse(String(batchInit.body))).toEqual({
      requests: [
        {
          updateCells: {
            range: {
              sheetId: 11,
              startRowIndex: 0,
              endRowIndex: 5,
              startColumnIndex: 0,
              endColumnIndex: 3,
            },
            rows: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'Account' } },
                  { userEnteredValue: { stringValue: 'Icon' } },
                  { userEnteredValue: { stringValue: 'Color' } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: '=Local' } },
                  { userEnteredValue: { stringValue: '+Wallet' } },
                  { userEnteredValue: { stringValue: '@indigo' } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: 'Bank' } },
                  { userEnteredValue: { stringValue: 'Banknote' } },
                  { userEnteredValue: { stringValue: '#123456' } },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ],
    });
    expect(String(batchInit.body)).not.toContain('formulaValue');
    expect(requestAt(fetchMock, 2)[0]).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Account!A2:C',
    );
    expect(fetchMock.mock.calls.some(([url, init]) => {
      const requestUrl = String(url);
      return requestUrl.includes(':clear') || (requestUrl.includes('/values/') && init?.method === 'PUT');
    })).toBe(false);
  });

  it('writes only the Account header while clearing stale rows for an empty replacement', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          settingsMetadata({ sheetId: 11, title: 'Account', rowCount: 40, columnCount: 3 }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await replaceSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'accounts', []);

    expect(result).toEqual({ status: 'ok', present: true, value: [] });
    const body = JSON.parse(String(requestAt(fetchMock, 1)[1].body));
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].updateCells.range).toMatchObject({
      startRowIndex: 0,
      endRowIndex: 40,
      startColumnIndex: 0,
      endColumnIndex: 3,
    });
    expect(body.requests[0].updateCells.rows).toEqual([
      {
        values: [
          { userEnteredValue: { stringValue: 'Account' } },
          { userEnteredValue: { stringValue: 'Icon' } },
          { userEnteredValue: { stringValue: 'Color' } },
        ],
      },
    ]);
  });

  it('grows both dimensions in the same atomic Category replacement batch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          settingsMetadata({ sheetId: 12, title: 'Category', rowCount: 2, columnCount: 2 }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            ['expense', 'Food', 'Tag', '#111111'],
            ['income', 'Salary', 'BadgeDollarSign', '#222222'],
            ['transfer', 'Savings', 'PiggyBank', '#333333'],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await replaceSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'categories', {
      expense: [{ name: 'Food', icon: 'Tag', color: '#111111' }],
      income: [{ name: 'Salary', icon: 'BadgeDollarSign', color: '#222222' }],
      transfer: [{ name: 'Savings', icon: 'PiggyBank', color: '#333333' }],
    });

    expect(result).toMatchObject({ status: 'ok', present: true });
    const body = JSON.parse(String(requestAt(fetchMock, 1)[1].body));
    expect(body.requests.slice(0, 2)).toEqual([
      { appendDimension: { sheetId: 12, dimension: 'ROWS', length: 2 } },
      { appendDimension: { sheetId: 12, dimension: 'COLUMNS', length: 2 } },
    ]);
    expect(body.requests[2].updateCells).toMatchObject({
      range: {
        sheetId: 12,
        startRowIndex: 0,
        endRowIndex: 4,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
      fields: 'userEnteredValue',
    });
    expect(body.requests[2].updateCells.rows[0].values).toEqual(
      ['Type', 'Category', 'Icon', 'Color'].map((stringValue) => ({
        userEnteredValue: { stringValue },
      })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lazily creates Quick Note, atomically replaces it, and reads it back', async () => {
    const quickNotes = {
      'default:expense': [
        {
          id: '+coffee',
          icon: 'Coffee',
          label: '@Coffee',
          note: '=SUM(A1:A2)',
          amount: '120',
          currency: 'THB',
          account: 'Cash',
          forValue: 'Me',
        },
      ],
      'transfer:Savings': [],
    };
    const quickNoteRows = [
      [
        'default',
        'expense',
        '',
        'note',
        '1',
        '+coffee',
        'Coffee',
        '@Coffee',
        '=SUM(A1:A2)',
        '120',
        'THB',
        'Cash',
        'Me',
      ],
      ['category', 'transfer', 'Savings', 'empty', '', '', '', '', '', '', '', '', ''],
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(settingsMetadata({ sheetId: 0, title: 'Transactions' })),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          replies: [
            {
              addSheet: {
                properties: {
                  sheetId: 13,
                  title: 'Quick Note',
                  gridProperties: { rowCount: 1, columnCount: 5 },
                },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ values: quickNoteRows }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await replaceSheetSettingsSection(
      ACCESS_TOKEN,
      SHEET_ID,
      'quickNotes',
      quickNotes,
    );

    expect(result).toEqual({ status: 'ok', present: true, value: quickNotes });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(requestAt(fetchMock, 1)[1].body))).toEqual({
      requests: [{ addSheet: { properties: { title: 'Quick Note' } } }],
    });

    const replacementBody = JSON.parse(String(requestAt(fetchMock, 2)[1].body));
    expect(replacementBody.requests.slice(0, 2)).toEqual([
      { appendDimension: { sheetId: 13, dimension: 'ROWS', length: 2 } },
      { appendDimension: { sheetId: 13, dimension: 'COLUMNS', length: 8 } },
    ]);
    const updateCells = replacementBody.requests[2].updateCells;
    expect(updateCells.range).toEqual({
      sheetId: 13,
      startRowIndex: 0,
      endRowIndex: 3,
      startColumnIndex: 0,
      endColumnIndex: 13,
    });
    expect(updateCells.rows[0].values).toEqual(
      QUICK_NOTE_HEADERS.map((stringValue) => ({ userEnteredValue: { stringValue } })),
    );
    expect(updateCells.rows[1].values[4]).toEqual({
      userEnteredValue: { stringValue: '1' },
    });
    expect(updateCells.rows[1].values[8]).toEqual({
      userEnteredValue: { stringValue: '=SUM(A1:A2)' },
    });
    expect(String(requestAt(fetchMock, 2)[1].body)).not.toContain('formulaValue');
    expect(requestAt(fetchMock, 3)[0]).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Quick Note!A2:M',
    );
  });
});

describe('mock settings Sheet parity', () => {
  afterEach(() => {
    clearMockData();
  });

  it('distinguishes a missing Quick Note tab from a present empty replacement', async () => {
    clearMockData();

    const initial = await readMockSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);
    expect(initial.accounts).toMatchObject({ status: 'ok', present: true });
    expect(initial.categories).toMatchObject({ status: 'ok', present: true });
    expect(initial.quickNotes).toEqual({ status: 'ok', present: false, value: {} });

    await expect(
      replaceMockSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'quickNotes', {}),
    ).resolves.toEqual({ status: 'ok', present: true, value: {} });

    const reread = await readMockSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID);
    expect(reread.quickNotes).toEqual({ status: 'ok', present: true, value: {} });
  });

  it('replaces all mock sections, including complete empty values', async () => {
    clearMockData();
    const quickNotes = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };

    await replaceMockSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'accounts', []);
    await replaceMockSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'categories', {
      expense: [],
      income: [],
      transfer: [],
    });
    await expect(
      replaceMockSheetSettingsSection(ACCESS_TOKEN, SHEET_ID, 'quickNotes', quickNotes),
    ).resolves.toEqual({ status: 'ok', present: true, value: quickNotes });

    await expect(readMockSheetSettingsConfig(ACCESS_TOKEN, SHEET_ID)).resolves.toEqual({
      accounts: { status: 'ok', present: true, value: [] },
      categories: {
        status: 'ok',
        present: true,
        value: { expense: [], income: [], transfer: [] },
      },
      quickNotes: { status: 'ok', present: true, value: quickNotes },
    });
  });
});
