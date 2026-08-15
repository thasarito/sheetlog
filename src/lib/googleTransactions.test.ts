import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTransaction,
  ensureHeaders,
  ensureReimbursementHeader,
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

  it("appends an A:L row as raw values so formula-like notes stay literal", async () => {
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
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A:L:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      values: [
        [
          "2026-08-15T10:00:00.000Z",
          "income",
          40,
          "Reimbursement",
          '=IMPORTXML("https://example.com", "//title")',
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

  it("updates exactly A:L as raw values while preserving numeric amounts and literal notes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await updateRow(
      ACCESS_TOKEN,
      SHEET_ID,
      8,
      transaction({ amount: 55, note: "=1+1" }),
    );

    const [url, init] = requestAt(fetchMock, 0);
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Transactions!A8%3AL8?valueInputOption=RAW",
    );
    const body = JSON.parse(String(init.body)) as { values: unknown[][] };
    expect(body.values).toHaveLength(1);
    expect(body.values[0]).toHaveLength(12);
    expect(body.values[0][2]).toBe(55);
    expect(typeof body.values[0][2]).toBe("number");
    expect(body.values[0][4]).toBe("=1+1");
    expect(body.values[0][10]).toBe("income-1");
    expect(body.values[0][11]).toBe("expense-1");
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
            [
              "2026-08-15T10:00:00.000Z",
              "income",
              40,
              "Reimbursement",
              "Cafe",
              "2026-08-15T10:00:00.000Z",
              "PWA",
              "THB",
              "Bank",
              "Me",
              "income-1",
              "expense-1",
            ],
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
      reimbursesTransactionId: "expense-1",
    });
    expect(records[1]).toMatchObject({
      sheetId: SHEET_ID,
      sheetRow: 2,
      sheetRowValid: true,
      reimbursesTransactionId: undefined,
    });
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

    await expect(
      readTransactionIdMap(ACCESS_TOKEN, SHEET_ID),
    ).rejects.toThrow(
      'Duplicate transaction ID "duplicate-id" found in Transactions!K at rows 2 and 4',
    );
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
