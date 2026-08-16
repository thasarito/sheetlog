import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTransaction,
  DuplicateTransactionIdError,
  ensureHeaders,
  ensureReimbursementHeader,
  getTransactionHistorySnapshot,
  getRecentTransactions,
  readLinkedReimbursements,
  readTransactionById,
  readTransactionIdMap,
  updateRow,
} from "./google";
import {
  appendTransaction as appendMockTransaction,
  ensureReimbursementHeader as ensureMockReimbursementHeader,
  getRecentTransactions as getRecentMockTransactions,
  readLinkedReimbursements as readLinkedMockReimbursements,
  readTransactionById as readMockTransactionById,
  updateRow as updateMockRow,
} from "./mock/mockGoogle";
import { clearMockData } from "./mock/mockStorage";
import { TRANSACTION_HEADERS } from "./transactionRows";
import type { TransactionRecord } from "./types";

const ACCESS_TOKEN = "access-token";
const SHEET_ID = "sheet-id";

const legacyRow = [
  "2026-08-15T09:00:00.000Z",
  "expense",
  100,
  "Dining",
  "Cafe",
  "2026-08-15T09:00:00.000Z",
  "PWA",
  "THB",
  "Cash",
  "Me",
  "expense-1",
];

const numericSheetRow = [
  46249 + (9 * 60 + 30) / (24 * 60),
  "income",
  40,
  "Reimbursement",
  "Cafe",
  46249 + (10 * 60 * 60 + 45 * 60 + 30) / (24 * 60 * 60),
  "PWA",
  "THB",
  "Bank",
  "Me",
  "income-1",
  "expense-1",
];

function transaction(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: "income-1",
    type: "income",
    amount: 40,
    category: "Reimbursement",
    note: "Cafe",
    date: "2026-08-15T10:00:00.000Z",
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    currency: "THB",
    account: "Bank",
    for: "Me",
    status: "pending",
    reimbursesTransactionId: "expense-1",
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

describe("Google transaction Sheet APIs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the full A:L header while the reimbursement upgrader writes only L1", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ updatedCells: 12 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await ensureHeaders(ACCESS_TOKEN, SHEET_ID);
    await ensureReimbursementHeader(ACCESS_TOKEN, SHEET_ID);

    const [headersUrl, headersInit] = requestAt(fetchMock, 0);
    expect(headersUrl).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A1:L1?valueInputOption=RAW",
    );
    expect(headersInit).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ values: [TRANSACTION_HEADERS] }),
    });

    const [upgradeUrl, upgradeInit] = requestAt(fetchMock, 1);
    expect(upgradeUrl).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!L1:L1?valueInputOption=RAW",
    );
    expect(upgradeInit).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ values: [["Reimburses Id"]] }),
    });
  });

  it("appends with USER_ENTERED so dates stay native while formula-like notes are literal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        updates: { updatedRange: "Transactions!A8:L8" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const row = await appendTransaction(
      ACCESS_TOKEN,
      SHEET_ID,
      transaction({ note: "=IMPORTXML(\"https://example.com\", \"//title\")" }),
    );

    expect(row).toBe(8);
    const [url, init] = requestAt(fetchMock, 0);
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A:L:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      values: [
        [
          "2026-08-15T10:00:00.000Z",
          "income",
          40,
          "Reimbursement",
          '\'=IMPORTXML("https://example.com", "//title")',
          "2026-08-15T10:00:00.000Z",
          "PWA",
          "THB",
          "Bank",
          "Me",
          "income-1",
          "expense-1",
        ],
      ],
    });
  });

  it("updates A:L with typed dates/numbers and literalizes dangerous text columns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await updateRow(
      ACCESS_TOKEN,
      SHEET_ID,
      8,
      transaction({
        id: "+income-1",
        amount: 55,
        category: "=Category",
        note: " \t+note",
        currency: "\u0000-THB",
        account: "\r@Bank",
        for: "\n=Me",
        reimbursesTransactionId: "-expense-1",
      }),
    );

    const [url, init] = requestAt(fetchMock, 0);
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A8%3AL8?valueInputOption=USER_ENTERED",
    );
    const body = JSON.parse(String(init.body)) as { values: unknown[][] };
    expect(body.values).toHaveLength(1);
    expect(body.values[0]).toHaveLength(12);
    expect(body.values[0][0]).toBe("2026-08-15T10:00:00.000Z");
    expect(body.values[0][1]).toBe("income");
    expect(body.values[0][2]).toBe(55);
    expect(typeof body.values[0][2]).toBe("number");
    expect(body.values[0][3]).toBe("'=Category");
    expect(body.values[0][4]).toBe("' \t+note");
    expect(body.values[0][5]).toBe("2026-08-15T10:00:00.000Z");
    expect(body.values[0][6]).toBe("PWA");
    expect(body.values[0][7]).toBe("'\u0000-THB");
    expect(body.values[0][8]).toBe("'\r@Bank");
    expect(body.values[0][9]).toBe("'\n=Me");
    expect(body.values[0][10]).toBe("'+income-1");
    expect(body.values[0][11]).toBe("'-expense-1");
  });

  it("keeps K as the count range, reads recent rows from A:L, and assigns Sheet provenance", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ values: [["expense-1"], ["income-1"]] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            legacyRow,
            numericSheetRow,
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const records = await getRecentTransactions(ACCESS_TOKEN, SHEET_ID, 50);

    expect(requestAt(fetchMock, 0)[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!K2:K",
    );
    expect(requestAt(fetchMock, 1)[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A2:L3?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER",
    );
    expect(records.map(({ id }) => id)).toEqual(["income-1", "expense-1"]);
    expect(records[0]).toMatchObject({
      sheetId: SHEET_ID,
      sheetRow: 3,
      sheetRowValid: true,
      date: new Date(2026, 7, 15, 9, 30, 0).toISOString(),
      createdAt: new Date(2026, 7, 15, 10, 45, 30).toISOString(),
      updatedAt: new Date(2026, 7, 15, 10, 45, 30).toISOString(),
      reimbursesTransactionId: "expense-1",
    });
    expect(records[1]).toMatchObject({
      sheetId: SHEET_ID,
      sheetRow: 2,
      sheetRowValid: true,
      date: "2026-08-15T09:00:00.000Z",
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
      reimbursesTransactionId: undefined,
    });
  });

  it("downloads a complete history snapshot in bounded chunks and keeps legacy rows read-only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          values: [["expense-1"], [], ["income-1"], ["expense-4"]],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ values: [[1], [2], [3], [4], [5]] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ values: [legacyRow, [], numericSheetRow] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [
              "2026-08-14T09:00:00.000Z",
              "expense",
              12,
              "Transit",
              "Train",
              "2026-08-14T09:00:00.000Z",
              "PWA",
              "THB",
              "Card",
              "Me",
              "expense-4",
            ],
            [
              "2026-08-13T09:00:00.000Z",
              "expense",
              20,
              "Legacy",
              "Cash purchase",
              "2026-08-13T09:00:00.000Z",
              "PWA",
              "THB",
              "Cash",
              "Me",
              "",
            ],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [["expense-1"], [], ["income-1"], ["expense-4"]],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ values: [[1], [2], [3], [4], [5]] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getTransactionHistorySnapshot(
      ACCESS_TOKEN,
      SHEET_ID,
      { chunkSize: 3 },
    );

    expect(requestAt(fetchMock, 0)[0]).toContain("Transactions!K2:K");
    expect(requestAt(fetchMock, 1)[0]).toContain("Transactions!A2:A");
    expect(requestAt(fetchMock, 2)[0]).toContain("Transactions!A2:L4");
    expect(requestAt(fetchMock, 3)[0]).toContain("Transactions!A5:L6");
    expect(requestAt(fetchMock, 4)[0]).toContain("Transactions!K2:K");
    expect(requestAt(fetchMock, 5)[0]).toContain("Transactions!A2:A");
    expect(snapshot.meta).toMatchObject({
      sheetId: SHEET_ID,
      sourceLastRow: 6,
      rowCount: 4,
    });
    expect(snapshot.records.map(({ id }) => id)).toEqual([
      "expense-1",
      "income-1",
      "expense-4",
      "row-6",
    ]);
    expect(snapshot.records[1]).toMatchObject({
      date: new Date(2026, 7, 15, 9, 30, 0).toISOString(),
      sheetRow: 4,
      canEdit: true,
    });
    expect(snapshot.records[3]).toMatchObject({
      id: "row-6",
      sheetRow: 6,
      canEdit: false,
      searchText: "legacy cash purchase cash",
    });
  });

  it("returns an empty complete snapshot without requesting row chunks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getTransactionHistorySnapshot(
      ACCESS_TOKEN,
      SHEET_ID,
    );

    expect(snapshot.records).toEqual([]);
    expect(snapshot.meta).toMatchObject({
      sourceLastRow: 1,
      rowCount: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries instead of caching a snapshot whose A/K boundary changed mid-download", async () => {
    const fetchMock = vi
      .fn()
      // First attempt starts with one row.
      .mockResolvedValueOnce(jsonResponse({ values: [["expense-1"]] }))
      .mockResolvedValueOnce(jsonResponse({ values: [[1]] }))
      .mockResolvedValueOnce(jsonResponse({ values: [legacyRow] }))
      // An append appears in the ending fingerprint.
      .mockResolvedValueOnce(
        jsonResponse({ values: [["expense-1"], ["income-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [[1], [2]] }))
      // The retry observes and downloads the stable two-row Sheet.
      .mockResolvedValueOnce(
        jsonResponse({ values: [["expense-1"], ["income-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [[1], [2]] }))
      .mockResolvedValueOnce(
        jsonResponse({ values: [legacyRow, numericSheetRow] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ values: [["expense-1"], ["income-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [[1], [2]] }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getTransactionHistorySnapshot(
      ACCESS_TOKEN,
      SHEET_ID,
    );

    expect(snapshot.records.map(({ id }) => id)).toEqual([
      "expense-1",
      "income-1",
    ]);
    expect(snapshot.meta).toMatchObject({
      sourceLastRow: 3,
      rowCount: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("rejects duplicate stable IDs instead of caching an incomplete snapshot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ values: [["expense-1"], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [[1], [2]] }))
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            legacyRow,
            [
              ...legacyRow.slice(0, 3),
              "Duplicate",
              ...legacyRow.slice(4),
            ],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ values: [["expense-1"], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [[1], [2]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getTransactionHistorySnapshot(ACCESS_TOKEN, SHEET_ID),
    ).rejects.toMatchObject({
      name: "DuplicateTransactionIdError",
      transactionId: "expense-1",
      firstRow: 2,
      duplicateRow: 3,
    });
  });

  it("rejects a stable ID that collides with a synthesized legacy row ID", async () => {
    const legacyWithoutId = [...legacyRow];
    legacyWithoutId[10] = "";
    const stableCollision = [...numericSheetRow];
    stableCollision[10] = "row-2";
    const boundaryIds = [[], ["row-2"]];
    const boundaryDates = [[1], [2]];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ values: boundaryIds }))
      .mockResolvedValueOnce(jsonResponse({ values: boundaryDates }))
      .mockResolvedValueOnce(
        jsonResponse({ values: [legacyWithoutId, stableCollision] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: boundaryIds }))
      .mockResolvedValueOnce(jsonResponse({ values: boundaryDates }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getTransactionHistorySnapshot(ACCESS_TOKEN, SHEET_ID),
    ).rejects.toMatchObject({
      name: "DuplicateTransactionIdError",
      transactionId: "row-2",
      firstRow: 2,
      duplicateRow: 3,
    });
  });

  it("passes one abort signal through every history request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      expect(init.signal).toBe(controller.signal);
      controller.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getTransactionHistorySnapshot(ACCESS_TOKEN, SHEET_ID, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves a transaction's current row from column K before reading its A:L values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ values: [["other-id"], [], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ values: [[...legacyRow, "parent-expense"]] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const record = await readTransactionById(
      ACCESS_TOKEN,
      SHEET_ID,
      "expense-1",
    );

    expect(requestAt(fetchMock, 0)[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!K2:K",
    );
    expect(requestAt(fetchMock, 1)[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A4:L4?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER",
    );
    expect(record).toMatchObject({
      id: "expense-1",
      date: "2026-08-15T09:00:00.000Z",
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
      sheetId: SHEET_ID,
      sheetRow: 4,
      reimbursesTransactionId: "parent-expense",
    });
  });

  it("rejects duplicate nonblank stable IDs with both conflicting K rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        values: [["duplicate-id"], [], [" duplicate-id "]],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const failure = await readTransactionIdMap(
      ACCESS_TOKEN,
      SHEET_ID,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DuplicateTransactionIdError);
    expect(failure).toMatchObject({
      transactionId: "duplicate-id",
      firstRow: 2,
      duplicateRow: 4,
      message:
        'Duplicate transaction ID "duplicate-id" found in Transactions!K at rows 2 and 4. Remove the duplicate row before syncing.',
    });
  });

  it("re-resolves column K once when a row shift returns a different transaction", async () => {
    const shiftedRow = [...legacyRow];
    shiftedRow[10] = "other-id";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ values: [["other-id"], [], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [shiftedRow] }))
      .mockResolvedValueOnce(
        jsonResponse({ values: [["other-id"], [], [], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [legacyRow] }));
    vi.stubGlobal("fetch", fetchMock);

    const record = await readTransactionById(
      ACCESS_TOKEN,
      SHEET_ID,
      "expense-1",
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestAt(fetchMock, 1)[0]).toContain("Transactions!A4:L4");
    expect(requestAt(fetchMock, 2)[0]).toContain("Transactions!K2:K");
    expect(requestAt(fetchMock, 3)[0]).toContain("Transactions!A5:L5");
    expect(record).toMatchObject({
      id: "expense-1",
      sheetId: SHEET_ID,
      sheetRow: 5,
    });
  });

  it("returns null when a mismatched row is no longer present in the refreshed ID map", async () => {
    const shiftedRow = [...legacyRow];
    shiftedRow[10] = "other-id";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ values: [["other-id"], [], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [shiftedRow] }))
      .mockResolvedValueOnce(jsonResponse({ values: [["other-id"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readTransactionById(ACCESS_TOKEN, SHEET_ID, "expense-1"),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bounds row-shift recovery to one retry when the second row also mismatches", async () => {
    const firstWrongRow = [...legacyRow];
    firstWrongRow[10] = "other-id";
    const secondWrongRow = [...legacyRow];
    secondWrongRow[10] = "another-id";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ values: [["other-id"], [], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [firstWrongRow] }))
      .mockResolvedValueOnce(
        jsonResponse({ values: [["other-id"], [], [], ["expense-1"]] }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [secondWrongRow] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readTransactionById(ACCESS_TOKEN, SHEET_ID, "expense-1"),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns null without a row fetch when the stable ID is absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ values: [["other-id"]] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readTransactionById(ACCESS_TOKEN, SHEET_ID, "missing-id"),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aligns uneven batch ranges by row offset and skips blank or malformed linked rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        valueRanges: [
          {
            range: "Transactions!B2:C7",
            values: [
              ["income", 10],
              ["income", "not-an-amount"],
              [],
              ["expense", 30],
              ["income", -5],
            ],
          },
          {
            range: "Transactions!H2:L7",
            values: [
              ["THB", "Bank", "Me", "child-2", "expense-1"],
              ["THB", "", "", "bad-3", "expense-1"],
              ["THB", "", "", "ghost-4", "expense-1"],
              ["THB", "", "", "expense-5", "expense-1"],
              ["USD", "", "", "child-6", "expense-1"],
              ["THB", "", "", "trailing-7", "expense-1"],
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await readLinkedReimbursements(
      ACCESS_TOKEN,
      SHEET_ID,
      "expense-1",
    );

    const [rawUrl, init] = requestAt(fetchMock, 0);
    const url = new URL(rawUrl);
    expect(url.origin + url.pathname).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values:batchGet",
    );
    expect(url.searchParams.getAll("ranges")).toEqual([
      "Transactions!B2:C",
      "Transactions!H2:L",
    ]);
    expect(url.searchParams.get("valueRenderOption")).toBe(
      "UNFORMATTED_VALUE",
    );
    expect(init?.method).toBeUndefined();
    expect(rows).toEqual([
      {
        id: "child-2",
        type: "income",
        amount: 10,
        currency: "THB",
        reimbursesTransactionId: "expense-1",
        status: "synced",
        sheetRow: 2,
      },
      {
        id: "child-6",
        type: "income",
        amount: -5,
        currency: "USD",
        reimbursesTransactionId: "expense-1",
        status: "synced",
        sheetRow: 6,
      },
    ]);
  });
});

describe("mock transaction Sheet APIs", () => {
  beforeEach(() => {
    clearMockData();
  });

  afterEach(() => {
    clearMockData();
  });

  it("preserves relations and Sheet provenance across append, update, recent, and focused reads", async () => {
    const initial = transaction();
    await ensureMockReimbursementHeader(ACCESS_TOKEN, SHEET_ID);
    await expect(
      appendMockTransaction(ACCESS_TOKEN, SHEET_ID, initial),
    ).resolves.toBe(2);

    const recent = await getRecentMockTransactions(
      ACCESS_TOKEN,
      SHEET_ID,
      50,
    );
    expect(recent[0]).toMatchObject({
      id: "income-1",
      reimbursesTransactionId: "expense-1",
      sheetId: SHEET_ID,
      sheetRow: 2,
      sheetRowValid: true,
      status: "synced",
    });

    const byId = await readMockTransactionById(
      ACCESS_TOKEN,
      SHEET_ID,
      "income-1",
    );
    expect(byId).toMatchObject({
      id: "income-1",
      reimbursesTransactionId: "expense-1",
      sheetId: SHEET_ID,
      sheetRow: 2,
      sheetRowValid: true,
    });

    expect(
      await readLinkedMockReimbursements(
        ACCESS_TOKEN,
        SHEET_ID,
        "expense-1",
      ),
    ).toEqual([
      {
        id: "income-1",
        type: "income",
        amount: 40,
        currency: "THB",
        reimbursesTransactionId: "expense-1",
        status: "synced",
        sheetRow: 2,
      },
    ]);

    await updateMockRow(
      ACCESS_TOKEN,
      SHEET_ID,
      2,
      transaction({ amount: 60 }),
    );
    expect(
      await readMockTransactionById(
        ACCESS_TOKEN,
        SHEET_ID,
        "income-1",
      ),
    ).toMatchObject({
      amount: 60,
      reimbursesTransactionId: "expense-1",
      sheetId: SHEET_ID,
    });
  });
});
