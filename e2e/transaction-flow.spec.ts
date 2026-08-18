import { expect, type Locator, type Page, test } from "@playwright/test";
import { serializeTransactionRowForUserEntered } from "../src/lib/transactionRows";

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
  place?: { provider: "google"; placeId: string };
  status: "pending" | "synced" | "error";
  createdAt: string;
  updatedAt: string;
  sheetRow?: number;
  sheetId?: string;
  sheetRowValid?: boolean;
};

type RequiredBox = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function expectSameBox(actual: RequiredBox, expected: RequiredBox) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1);
}

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

async function collapseTransactionEntry(page: Page) {
  const collapse = page.getByRole("button", {
    name: "Collapse transaction entry",
  });
  await expect(collapse).toBeVisible();
  await collapse.click();
  const sheet = page.getByRole("dialog", { name: "Transaction entry" });
  await expect(
    page.getByRole("button", { name: "Expand transaction entry" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      sheet.evaluate((element) => {
        const layout = document.querySelector<HTMLElement>(
          '[data-testid="category-step-layout"]',
        );
        if (!layout) return Number.POSITIVE_INFINITY;
        const visibleHeight = Number.parseFloat(
          getComputedStyle(layout).getPropertyValue(
            "--category-sheet-occlusion",
          ),
        );
        const translateY = new DOMMatrixReadOnly(
          getComputedStyle(element).transform,
        ).m42;
        return Math.abs(translateY - (window.innerHeight - visibleHeight));
      }),
    )
    .toBeLessThan(1);
}

async function openTransactionHistory(page: Page) {
  await collapseTransactionEntry(page);
  const viewport = page.getByTestId("home-carousel-viewport");
  const transactionSlide = page.getByLabel("Transactions, slide 2 of 2");
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(transactionSlide).toHaveAttribute("aria-hidden", "false");
}

async function openSourceExpense(page: Page) {
  await openTransactionHistory(page);
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

async function readMockTransactions(page: Page): Promise<StoredTransaction[]> {
  return page.evaluate(
    (key) =>
      JSON.parse(
        window.localStorage.getItem(key) ?? "[]",
      ) as StoredTransaction[],
    MOCK_TRANSACTIONS_KEY,
  );
}

async function writeSettingsRecords(
  page: Page,
  records: Array<{ key: string; value: unknown }>,
) {
  await page.evaluate(async (settingsRecords) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = window.indexedDB.open("SheetLogDB");
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => resolve(openRequest.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      for (const record of settingsRecords) {
        store.put({
          key: record.key,
          value: JSON.stringify(record.value),
          updatedAt: "2026-08-16T12:00:00.000Z",
        });
      }
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
    });
  }, records);
}

async function readAutocompleteInputs(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      [
        ...(
          window as typeof window & {
            __sheetlogMapsAutocompleteInputs: string[];
          }
        ).__sheetlogMapsAutocompleteInputs,
      ],
  );
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

          const autocompletePlaces = [
            ["central-cafe", "Central Cafe", "123 Test Street"],
            ["central-bakery", "Central Bakery", "124 Test Street"],
            ["central-market", "Central Market", "125 Test Street"],
            ["central-kitchen", "Central Kitchen", "126 Test Street"],
            ["central-coffee", "Central Coffee", "127 Test Street"],
            ["central-park", "Central Park Cafe", "128 Test Street"],
          ];

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
                    ? autocompletePlaces.map(
                        ([placeId, displayName, secondaryText]) => ({
                          placePrediction: {
                            placeId,
                            mainText: displayName,
                            secondaryText,
                            text: displayName + ", " + secondaryText,
                            types: ["establishment", "cafe"],
                            toPlace: () => ({
                              fetchFields: async () => ({
                                place: { displayName },
                              }),
                            }),
                          },
                        }),
                      )
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
    await openTransactionHistory(page);
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

    await openTransactionHistory(page);
    await expect(page.getByText("Ancient archive")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View all transactions" }),
    ).toHaveCount(0);
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

test.describe("Transaction flow - settings sync", () => {
  test("shows durable offline diagnostics and captures the mobile settings state", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedTransactions(page, []);
    await page.goto("/app");
    await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(
      page.getByRole("button", { name: /Sync Settings/ }),
    ).toContainText("Synced");
    await page.getByRole("button", { name: "Done" }).click();

    await writeSettingsRecords(page, [
      {
        key: "settingsSync:mock-sheet-id-dev:sheetlog-dev-user",
        value: {
          targetUserId: "sheetlog-dev-user",
          baselines: {
            accounts: "accounts-baseline",
            categories: "categories-baseline",
            quickNotes: "quick-notes-baseline",
          },
          dirty: ["categories"],
          errors: {
            categories:
              "Category row 4 is invalid. Fix it in Google Sheets, then sync again.",
          },
          lastSyncedAt: "2026-08-16T11:55:00.000Z",
          quickNotesMigration: {
            intent: "prompt",
            sourceFingerprint: "legacy-quick-notes",
            phase: "pending",
          },
        },
      },
      {
        key: "quickNotes",
        value: {
          "default:expense": [
            {
              id: "legacy-lunch",
              icon: "Utensils",
              label: "Lunch",
              note: "Legacy lunch",
            },
          ],
        },
      },
    ]);

    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => false,
      });
    });
    await page.reload();
    const persistedSyncState = await page.evaluate(async (key) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const openRequest = window.indexedDB.open("SheetLogDB");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => resolve(openRequest.result);
      });
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction("settings", "readonly");
        const request = transaction.objectStore("settings").get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          database.close();
          resolve(request.result ? JSON.parse(request.result.value) : null);
        };
      });
    }, "settingsSync:mock-sheet-id-dev:sheetlog-dev-user");
    expect(persistedSyncState).toMatchObject({
      dirty: ["categories"],
      errors: {
        categories:
          "Category row 4 is invalid. Fix it in Google Sheets, then sync again.",
      },
      quickNotesMigration: { intent: "prompt" },
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          caret-color: transparent !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
      `,
    });

    await page.getByRole("button", { name: "Open settings" }).click();

    await expect
      .poll(async () => {
        const box = await page
          .getByRole("heading", { name: "Settings", level: 1 })
          .boundingBox();
        return box?.y ?? Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(300);

    const syncButton = page.getByRole("button", { name: /Sync Settings/ });
    await expect(syncButton).toContainText("Needs attention");
    await expect(syncButton).toBeDisabled();
    await expect(
      page.getByText(
        "You’re offline. Changes stay on this device and will sync when you reconnect.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Categories: Category row 4 is invalid. Fix it in Google Sheets, then sync again.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Quick Notes from another Sheet were found on this device. Importing will replace this Sheet’s Quick Notes.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();

    const screenshotPath = testInfo.outputPath(
      "settings-sync-needs-attention.png",
    );
    await page.screenshot({ path: screenshotPath, scale: "css" });
    await testInfo.attach("Settings sync needs attention", {
      path: screenshotPath,
      contentType: "image/png",
    });
  });
});

test.describe("Transaction flow - Places", () => {
  test("renders inline note results over the keypad and preserves selected metadata", async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: new Date("2026-08-15T10:00:00.000Z") });
    await seedTransactions(page, []);
    await context.grantPermissions(["geolocation"], {
      origin: "http://localhost:5174",
    });
    await context.setGeolocation({ latitude: 13.7563, longitude: 100.5018 });
    await installGoogleMapsStub(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app");
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          caret-color: transparent !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
      `,
    });

    const safeAreaStyle = await page.addStyleTag({
      content: `body { padding-top: 59px !important; padding-bottom: 34px !important; }`,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.getElementById("root")?.getBoundingClientRect();
          const canvas = document
            .querySelector('[data-testid="transaction-canvas"]')
            ?.getBoundingClientRect();
          return root && canvas
            ? {
                rootTop: Math.round(root.top),
                rootBottom: Math.round(root.bottom),
                canvasTop: Math.round(canvas.top),
                canvasBottom: Math.round(canvas.bottom),
              }
            : null;
        }),
      )
      .toEqual({
        rootTop: 59,
        rootBottom: 810,
        canvasTop: 59,
        canvasBottom: 810,
      });
    await safeAreaStyle.evaluate((element) => element.remove());
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.getElementById("root")?.getBoundingClientRect();
          const canvas = document
            .querySelector('[data-testid="transaction-canvas"]')
            ?.getBoundingClientRect();
          return root && canvas
            ? {
                rootTop: Math.round(root.top),
                rootBottom: Math.round(root.bottom),
                canvasTop: Math.round(canvas.top),
                canvasBottom: Math.round(canvas.bottom),
              }
            : null;
        }),
      )
      .toEqual({
        rootTop: 0,
        rootBottom: 844,
        canvasTop: 0,
        canvasBottom: 844,
      });

    await page.getByRole("button", { name: "Dining Out" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await replaceKeypadAmount(page, "25");
    await page.getByRole("button", { name: "Cash", exact: true }).click();

    const nearbyChips = page.locator('button[aria-label^="Use "][aria-label$=" as note"]');
    await expect(nearbyChips).toHaveCount(5);
    const note = page.getByRole("combobox", { name: "Transaction note" });
    const keypad = page.getByRole("group", { name: "Amount keypad" });
    const submit = page.getByRole("button", { name: "Submit" });
    await expect(note).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(page.getByRole("button", { name: "Search places" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Search places" })).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Search places" })).toHaveCount(0);
    await expect(page.getByText("Google Maps", { exact: true })).toHaveCount(0);

    const beforeKeypad = await keypad.boundingBox();
    const beforeSubmit = await submit.boundingBox();
    if (!beforeKeypad || !beforeSubmit) {
      throw new Error("Expected transaction geometry before keyboard resize");
    }

    await page.clock.pauseAt(new Date("2026-08-15T10:10:00.000Z"));
    await note.fill("c");
    await page.clock.runFor(300);
    expect(await readAutocompleteInputs(page)).toEqual([]);
    await note.fill("  central   ");
    await page.clock.runFor(300);
    // TanStack Query batches resolved-query notifications on a zero-delay timer.
    await page.clock.runFor(1);
    await expect.poll(() => readAutocompleteInputs(page)).toEqual(["central"]);

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(6);

    const resultsNote = await note.boundingBox();
    const afterKeypad = await keypad.boundingBox();
    const afterSubmit = await submit.boundingBox();
    const listboxBox = await listbox.boundingBox();
    if (!resultsNote || !afterKeypad || !afterSubmit || !listboxBox) {
      throw new Error("Expected note results, keypad, and Submit geometry");
    }

    expectSameBox(afterKeypad, beforeKeypad);
    expectSameBox(afterSubmit, beforeSubmit);
    expect(listboxBox.y + listboxBox.height).toBeGreaterThan(afterKeypad.y);
    expect(await listbox.evaluate((element) => getComputedStyle(element).boxShadow)).toBe(
      "none",
    );
    expect(
      await listbox.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);

    const overlapLeft = Math.max(listboxBox.x, afterKeypad.x);
    const overlapRight = Math.min(
      listboxBox.x + listboxBox.width,
      afterKeypad.x + afterKeypad.width,
    );
    const overlapTop = Math.max(listboxBox.y, afterKeypad.y);
    const overlapBottom = Math.min(
      listboxBox.y + listboxBox.height,
      afterKeypad.y + afterKeypad.height,
    );
    expect(overlapRight).toBeGreaterThan(overlapLeft);
    expect(overlapBottom).toBeGreaterThan(overlapTop);
    const overlapPoint = {
      x: overlapLeft + (overlapRight - overlapLeft) / 2,
      y: overlapTop + Math.min(10, (overlapBottom - overlapTop) / 2),
    };
    expect(
      await listbox.evaluate((element, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return Boolean(hit && (hit === element || element.contains(hit)));
      }, overlapPoint),
    ).toBe(true);
    await expect(submit).toBeEnabled();

    const screenshotPath = testInfo.outputPath(
      "note-place-combobox-results.png",
    );
    await page.screenshot({ path: screenshotPath, scale: "css" });
    await testInfo.attach("Inline note Places results", {
      path: screenshotPath,
      contentType: "image/png",
    });

    const hasCoarsePointer = await page.evaluate(() =>
      window.matchMedia("(pointer: coarse)").matches,
    );
    if (hasCoarsePointer) {
      await page.setViewportSize({ width: 390, height: 544 });
      await page.clock.runFor(32);
      const keyboardNote = await note.boundingBox();
      const keyboardKeypad = await keypad.boundingBox();
      const keyboardSubmit = await submit.boundingBox();
      if (!keyboardNote || !keyboardKeypad || !keyboardSubmit) {
        throw new Error("Expected transaction geometry with keyboard visible");
      }
      expectSameBox(keyboardNote, resultsNote);
      expectSameBox(keyboardKeypad, afterKeypad);
      expectSameBox(keyboardSubmit, afterSubmit);
    }

    const autocompleteResult = page.getByRole("option", {
      name: /Central Cafe.*123 Test Street/,
    });
    await expect(autocompleteResult).toBeVisible();
    await autocompleteResult.click();
    await expect(note).toHaveValue("Central Cafe");
    await expect(note).not.toBeFocused();
    await expect(page.getByRole("listbox")).toHaveCount(0);

    if (hasCoarsePointer) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.clock.runFor(32);
      const restoredNote = await note.boundingBox();
      const restoredKeypad = await keypad.boundingBox();
      const restoredSubmit = await submit.boundingBox();
      if (!restoredNote || !restoredKeypad || !restoredSubmit) {
        throw new Error("Expected restored transaction geometry");
      }
      expectSameBox(restoredNote, resultsNote);
      expectSameBox(restoredKeypad, afterKeypad);
      expectSameBox(restoredSubmit, afterSubmit);
    }

    const clear = page.getByRole("button", { name: "Clear note" });
    const clearBox = await clear.boundingBox();
    expect(clearBox).not.toBeNull();
    expect(clearBox?.width).toBeGreaterThanOrEqual(44);
    expect(clearBox?.height).toBeGreaterThanOrEqual(44);

    await page.clock.runFor(300);
    expect(await readAutocompleteInputs(page)).toEqual(["central"]);

    await note.fill("Edited Central Cafe");
    await submit.click();
    await page.clock.resume();

    await expect.poll(async () => (await readMockTransactions(page)).length).toBe(1);
    const [row] = await readMockTransactions(page);
    expect(row).toMatchObject({
      note: "Edited Central Cafe",
      place: { provider: "google", placeId: "central-cafe" },
    });
    expect(serializeTransactionRowForUserEntered(row).slice(12, 14)).toEqual([
      "google",
      "central-cafe",
    ]);
  });

  test("clear removes note metadata and nearby selection can add it again", async ({
    context,
    page,
  }) => {
    await seedTransactions(page, []);
    await context.grantPermissions(["geolocation"], {
      origin: "http://localhost:5174",
    });
    await context.setGeolocation({ latitude: 13.7563, longitude: 100.5018 });
    await installGoogleMapsStub(page);
    await page.goto("/app");

    await page.getByRole("button", { name: "Dining Out" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await replaceKeypadAmount(page, "25");
    await page.getByRole("button", { name: "Cash", exact: true }).click();

    const note = page.getByRole("combobox", { name: "Transaction note" });
    const nearbyOne = page.getByRole("button", {
      name: "Use Nearby One as note",
    });
    await expect(nearbyOne).toBeVisible();
    await nearbyOne.click();
    await expect(note).toHaveValue("Nearby One");

    let clear = page.getByRole("button", { name: "Clear note" });
    const clearBox = await clear.boundingBox();
    expect(clearBox).not.toBeNull();
    expect(clearBox?.width).toBeGreaterThanOrEqual(44);
    expect(clearBox?.height).toBeGreaterThanOrEqual(44);
    await clear.click();
    await expect(note).toHaveValue("");
    await expect(note).toBeFocused();
    await expect(clear).toHaveCount(0);
    await expect(nearbyOne).toBeVisible();

    await page
      .getByRole("button", { name: "Use Nearby Two as note" })
      .click();
    await expect(note).toHaveValue("Nearby Two");
    clear = page.getByRole("button", { name: "Clear note" });
    await clear.click();
    await expect(note).toHaveValue("");
    await expect(note).toBeFocused();
    await expect(nearbyOne).toBeVisible();

    await page.getByRole("button", { name: "Submit" }).click();
    await expect.poll(async () => (await readMockTransactions(page)).length).toBe(1);
    const [row] = await readMockTransactions(page);
    expect(row.note).toBeUndefined();
    expect(row.place).toBeUndefined();
    expect(Object.hasOwn(row, "place")).toBe(false);
    expect(serializeTransactionRowForUserEntered(row).slice(12, 14)).toEqual([
      "",
      "",
    ]);
  });
});
