import { expect, type Locator, type Page, test } from "@playwright/test";

const MOCK_TRANSACTIONS_KEY = "sheetlog.mock.transactions";
const SOURCE_ID = "expense-source-1";

type StoredTransaction = {
  id: string;
  type: "expense" | "income" | "transfer";
  amount: number;
  currency: string;
  account: string;
  for: string;
  category: string;
  date: string;
  note?: string;
  reimbursesTransactionId?: string;
  status: "pending" | "synced" | "error";
  createdAt: string;
  updatedAt: string;
  sheetRow?: number;
  sheetId?: string;
  sheetRowValid?: boolean;
};

const sourceExpense: StoredTransaction = {
  id: SOURCE_ID,
  type: "expense",
  amount: 100,
  currency: "USD",
  account: "Cash",
  for: "Me",
  category: "Dining Out",
  date: "2026-08-15T12:00:00.000Z",
  note: "Dinner with friends",
  status: "synced",
  createdAt: "2026-08-15T12:00:00.000Z",
  updatedAt: "2026-08-15T12:00:00.000Z",
  sheetRow: 2,
  sheetId: "mock-sheet-id-dev",
  sheetRowValid: true,
};

const unrelatedLatestTransaction: StoredTransaction = {
  id: "unrelated-latest-1",
  type: "income",
  amount: 250,
  currency: "USD",
  account: "Bank",
  for: "Me",
  category: "Salary",
  date: "2026-08-15T13:00:00.000Z",
  note: "Unrelated latest row",
  status: "synced",
  createdAt: "2999-01-01T00:00:00.000Z",
  updatedAt: "2999-01-01T00:00:00.000Z",
  sheetRow: 4,
  sheetId: "mock-sheet-id-dev",
  sheetRowValid: true,
};

async function seedTransactions(
  page: Page,
  transactions: StoredTransaction[],
) {
  await page.addInitScript(
    ({ key, rows }) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, JSON.stringify(rows));
    },
    { key: MOCK_TRANSACTIONS_KEY, rows: transactions },
  );
}

async function expectBefore(before: Locator, after: Locator) {
  await expect(before).toBeVisible();
  await expect(after).toBeVisible();
  const afterElement = await after.elementHandle();
  expect(afterElement).not.toBeNull();
  expect(
    await before.evaluate(
      (element, nextElement) =>
        Boolean(
          nextElement &&
            element.compareDocumentPosition(nextElement) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      afterElement,
    ),
  ).toBe(true);
}

async function openSourceExpense(page: Page) {
  await page
    .getByRole("button", { name: /Dining Out.*Dinner with friends/ })
    .click();
  await expect(page.getByPlaceholder("Add a note...")).toHaveValue("Dinner with friends");
}

async function replaceKeypadAmount(page: Page, amount: string) {
  const keypad = page.getByRole("group", { name: "Amount keypad" });
  for (let index = 0; index < 3; index += 1) {
    await keypad.getByRole("button", { name: "Delete digit" }).click();
  }
  for (const digit of amount) {
    await keypad.getByRole("button", { name: digit }).click();
  }
}

async function appendTransactionToMockStores(page: Page, transaction: StoredTransaction) {
  await page.evaluate(
    async ({ key, row }) => {
      const rows = JSON.parse(window.localStorage.getItem(key) ?? "[]") as StoredTransaction[];
      rows.push(row);
      window.localStorage.setItem(key, JSON.stringify(rows));

      await new Promise<void>((resolve, reject) => {
        const openRequest = window.indexedDB.open("SheetLogDB");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const writeTransaction = database.transaction("transactions", "readwrite");
          writeTransaction.objectStore("transactions").put(row);
          writeTransaction.onerror = () => reject(writeTransaction.error);
          writeTransaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      });
    },
    { key: MOCK_TRANSACTIONS_KEY, row: transaction },
  );
}

async function readMockStoreState(page: Page) {
  return page.evaluate(async (key) => {
    const localRows = JSON.parse(window.localStorage.getItem(key) ?? "[]") as StoredTransaction[];
    const indexedDbRows = await new Promise<StoredTransaction[]>((resolve, reject) => {
      const openRequest = window.indexedDB.open("SheetLogDB");
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction("transactions", "readonly");
        const getAllRequest = transaction.objectStore("transactions").getAll();
        getAllRequest.onerror = () => reject(getAllRequest.error);
        getAllRequest.onsuccess = () => resolve(getAllRequest.result as StoredTransaction[]);
        transaction.oncomplete = () => database.close();
      };
    });
    const newestId = (rows: StoredTransaction[]) =>
      [...rows].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)?.id ??
      null;

    return {
      localIds: localRows.map((row) => row.id).sort(),
      localNewestId: newestId(localRows),
      indexedDbIds: indexedDbRows.map((row) => row.id).sort(),
      indexedDbNewestId: newestId(indexedDbRows),
    };
  }, MOCK_TRANSACTIONS_KEY);
}

async function installGoogleMapsStub(page: Page) {
  await page.route(/^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (() => {
          const nearbyPlaces = [
            ["nearby-1", "Nearby One", "1 Test Street"],
            ["nearby-2", "Nearby Two", "2 Test Street"],
            ["nearby-3", "Nearby Three", "3 Test Street"],
            ["nearby-4", "Nearby Four", "4 Test Street"],
            ["nearby-5", "Nearby Five", "5 Test Street"],
            ["nearby-6", "Nearby Six", "6 Test Street"],
          ].map(([id, displayName, formattedAddress]) => ({ id, displayName, formattedAddress }));

          class AutocompleteSessionToken {}

          window.__sheetlogMapsAutocompleteInputs = [];

          const placesLibrary = {
            Place: {
              searchNearby: async () => ({ places: nearbyPlaces }),
            },
            SearchNearbyRankPreference: { POPULARITY: "POPULARITY" },
            AutocompleteSessionToken,
            AutocompleteSuggestion: {
              fetchAutocompleteSuggestions: async ({ input }) => {
                window.__sheetlogMapsAutocompleteInputs.push(input);
                return {
                  suggestions: input
                    ? [
                        {
                          placePrediction: {
                            placeId: "central-cafe",
                            mainText: "Central Cafe",
                            secondaryText: "123 Test Street",
                            text: "Central Cafe, 123 Test Street",
                            types: ["establishment", "cafe"],
                            toPlace: () => ({
                              fetchFields: async () => ({
                                place: { displayName: "Central Cafe" },
                              }),
                            }),
                          },
                        },
                      ]
                    : [],
                };
              },
            },
          };

          window.google = {
            maps: {
              importLibrary: async (library) => {
                if (library !== "places") {
                  throw new Error("Unexpected Maps library: " + library);
                }
                return placesLibrary;
              },
            },
          };
        })();
      `,
    });
  });
}

test.describe("Transaction flow - linked reimbursements", () => {
  test("creates partial and remaining reimbursements from a source expense", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-15T10:00:00.000Z") });
    await seedTransactions(page, [sourceExpense]);
    await page.goto("/app");

    await openSourceExpense(page);

    const deleteButton = page.getByRole("button", { name: "Delete transaction" });
    const reimburseButton = page.getByRole("button", { name: "Reimburse" });
    const saveButton = page.getByRole("button", { name: "Save" });
    await expectBefore(deleteButton, reimburseButton);
    await expectBefore(reimburseButton, saveButton);

    await reimburseButton.click();
    await expect(page.getByText("Reimbursement", { exact: true })).toBeVisible();
    await replaceKeypadAmount(page, "40");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("Reimbursement recorded")).toBeVisible();
    await expect(page.getByText("USD 40", { exact: true })).toBeVisible();
    await expect(page.getByTestId("receipt-timed-progress")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo reimbursement" })).toBeVisible();
    await page.clock.pauseAt(new Date("2026-08-15T10:10:00.000Z"));
    await page.clock.fastForward(2_200);
    await expect(page.getByText("Reimbursement recorded")).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo reimbursement" })).toBeVisible();
    await page.clock.resume();
    await page.getByRole("button", { name: "Done" }).click();

    await openSourceExpense(page);
    await page.getByRole("button", { name: "Reimburse" }).click();
    await expect(page.getByText("60", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Reimbursement recorded")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await openSourceExpense(page);
    await expect(page.getByRole("button", { name: "Fully reimbursed" })).toBeDisabled();

    await expect
      .poll(() =>
        page.evaluate(
          ({ key, sourceId }) => {
            const rows = JSON.parse(window.localStorage.getItem(key) ?? "[]") as StoredTransaction[];
            return rows
              .filter((row) => row.reimbursesTransactionId === sourceId)
              .map(({ id, type, amount, reimbursesTransactionId }) => ({
                id,
                type,
                amount,
                reimbursesTransactionId,
              }));
          },
          { key: MOCK_TRANSACTIONS_KEY, sourceId: SOURCE_ID },
        ),
      )
      .toHaveLength(2);

    const reimbursements = await page.evaluate(
      ({ key, sourceId }) => {
        const rows = JSON.parse(window.localStorage.getItem(key) ?? "[]") as StoredTransaction[];
        return rows.filter((row) => row.reimbursesTransactionId === sourceId);
      },
      { key: MOCK_TRANSACTIONS_KEY, sourceId: SOURCE_ID },
    );
    expect(reimbursements.map((row) => row.amount).sort((left, right) => left - right)).toEqual([
      40,
      60,
    ]);
    expect(new Set(reimbursements.map((row) => row.id)).size).toBe(2);
    expect(reimbursements.every((row) => row.type === "income")).toBe(true);
  });

  test("Undo reimbursement removes only the child created by that receipt", async ({ page }) => {
    await seedTransactions(page, [sourceExpense]);
    await page.goto("/app");

    await openSourceExpense(page);
    await page.getByRole("button", { name: "Reimburse" }).click();
    await replaceKeypadAmount(page, "25");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Reimbursement recorded")).toBeVisible();

    const createdChildId = await page.evaluate(
      ({ key, sourceId }) => {
        const rows = JSON.parse(window.localStorage.getItem(key) ?? "[]") as StoredTransaction[];
        return rows.find((row) => row.reimbursesTransactionId === sourceId)?.id ?? null;
      },
      { key: MOCK_TRANSACTIONS_KEY, sourceId: SOURCE_ID },
    );
    if (!createdChildId) {
      throw new Error("Expected the reimbursement child to be persisted before Undo");
    }

    await appendTransactionToMockStores(page, unrelatedLatestTransaction);
    expect(await readMockStoreState(page)).toEqual({
      localIds: [SOURCE_ID, createdChildId, unrelatedLatestTransaction.id].sort(),
      localNewestId: unrelatedLatestTransaction.id,
      indexedDbIds: [SOURCE_ID, createdChildId, unrelatedLatestTransaction.id].sort(),
      indexedDbNewestId: unrelatedLatestTransaction.id,
    });

    await page.getByRole("button", { name: "Undo reimbursement" }).click();
    await expect(
      page.getByRole("button", { name: /Dining Out.*Dinner with friends/ }),
    ).toBeVisible();

    await expect.poll(() => readMockStoreState(page)).toEqual({
      localIds: [SOURCE_ID, unrelatedLatestTransaction.id].sort(),
      localNewestId: unrelatedLatestTransaction.id,
      indexedDbIds: [SOURCE_ID, unrelatedLatestTransaction.id].sort(),
      indexedDbNewestId: unrelatedLatestTransaction.id,
    });
  });
});

test.describe("Transaction flow - complete history", () => {
  test("virtualizes the full snapshot and searches beyond the recent window", async ({
    page,
  }) => {
    const start = new Date("2025-01-01T00:00:00.000Z").getTime();
    const transactions = Array.from({ length: 520 }, (_, index) => {
      const timestamp = new Date(start + index * 3_600_000).toISOString();
      return {
        id: `history-${index}`,
        type: "expense" as const,
        amount: index + 1,
        currency: "THB",
        account: index === 0 ? "Archive card" : "Wallet",
        for: "Me",
        category: index === 0 ? "Ancient archive" : `Category ${index}`,
        date: timestamp,
        note: index === 0 ? "Older than recent fifty" : undefined,
        status: "synced" as const,
        createdAt: timestamp,
        updatedAt: timestamp,
        sheetRow: index + 2,
        sheetId: "mock-sheet-id-dev",
        sheetRowValid: true,
      } satisfies StoredTransaction;
    });
    await seedTransactions(page, transactions);
    await page.goto("/app");

    await expect(page.getByText("Ancient archive")).toHaveCount(0);
    await page.getByRole("button", { name: "View all transactions" }).click();
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByText("520 transactions", { exact: true })).toBeVisible();
    await expect
      .poll(() => page.getByTestId("history-transaction-row").count())
      .toBeLessThan(50);

    await page
      .getByRole("searchbox", { name: "Search transaction history" })
      .fill("archive card");
    await expect(page.getByText("1 transaction", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Ancient archive/ }).click();

    await expect(page.getByPlaceholder("Add a note...")).toHaveValue(
      "Older than recent fifty",
    );
    await expect(
      page.getByRole("heading", { name: "Transactions" }),
    ).toHaveCount(0);
  });
});

test.describe("Transaction flow - Places", () => {
  test("shows five nearby places and resolves a searched place into the note", async ({
    context,
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-08-15T10:00:00.000Z") });
    await seedTransactions(page, []);
    await context.grantPermissions(["geolocation"], {
      origin: "http://localhost:5174",
    });
    await context.setGeolocation({ latitude: 13.7563, longitude: 100.5018 });
    await installGoogleMapsStub(page);
    await page.goto("/app");

    await page.getByRole("button", { name: "Dining Out" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    const nearbyChips = page.locator('button[aria-label^="Use "][aria-label$=" as note"]');
    await expect(nearbyChips).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Use Nearby One as note" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use Nearby Five as note" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use Nearby Six as note" })).toHaveCount(0);

    const searchButton = page.getByRole("button", { name: "Search places" });
    await expectBefore(nearbyChips.last(), searchButton);
    await expect(page.getByText("Google Maps", { exact: true })).toHaveCount(0);

    await searchButton.click();
    const searchInput = page.getByRole("searchbox", { name: "Search places" });
    await expect(searchInput).toBeFocused();
    await page.clock.pauseAt(new Date("2026-08-15T10:10:00.000Z"));
    await searchInput.fill("ce");
    await searchInput.fill("central");

    const autocompleteInputs = () =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __sheetlogMapsAutocompleteInputs: string[];
            }
          ).__sheetlogMapsAutocompleteInputs,
      );
    expect(await autocompleteInputs()).toEqual([]);
    await page.clock.runFor(249);
    expect(await autocompleteInputs()).toEqual([]);
    await page.clock.runFor(1);
    await expect.poll(autocompleteInputs).toEqual(["central"]);
    // TanStack Query batches resolved-query notifications on a zero-delay timer.
    await page.clock.runFor(1);

    const autocompleteResult = page.getByRole("button", {
      name: /Central Cafe.*123 Test Street/,
    });
    await expect(autocompleteResult).toBeVisible();
    await expect(page.getByText("123 Test Street", { exact: true })).toBeVisible();
    await page.clock.resume();
    await autocompleteResult.click();

    await expect(page.getByRole("dialog", { name: "Search places" })).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByPlaceholder("Add a note...")).toHaveValue("Central Cafe");
  });
});
