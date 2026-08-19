import { expect, test, type Locator, type Page } from "@playwright/test";
import { format, subDays } from "date-fns";
import type { TransactionRecord, TransactionType } from "../src/lib/types";

function transaction(
  id: string,
  daysAgo: number,
  type: TransactionType,
  amount: number,
  category: string,
  currency = "THB",
): TransactionRecord {
  const timestamp = format(
    subDays(new Date(), daysAgo),
    "yyyy-MM-dd'T'12:00:00",
  );
  return {
    id,
    type,
    amount,
    currency,
    account: type === "income" ? "Bank" : "Cash",
    for: "Me",
    category,
    note: id === "food" ? "Lunch" : undefined,
    date: timestamp,
    status: "synced",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const seededTransactions = [
  transaction("food", 0, "expense", 120, "Food Delivery"),
  transaction("coffee", 1, "expense", 80, "Coffee & Snacks"),
  transaction("transport", 2, "expense", 260, "Transport"),
  transaction("usd-coffee", 0, "expense", 3, "Coffee & Snacks", "USD"),
  transaction("salary", 2, "income", 2500, "Salary"),
  ...Array.from({ length: 12 }, (_, index) =>
    transaction(
      `history-${index}`,
      index + 3,
      "expense",
      20 + index,
      index === 11 ? "Final history item" : "Groceries & Home Supplies",
    ),
  ),
];

async function touchSwipe(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const client = await page.context().newCDPSession(page);
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  const start = {
    x: box.x + box.width * (deltaX < 0 ? 0.85 : deltaX > 0 ? 0.15 : 0.5),
    y: box.y + box.height * (horizontal ? 0.65 : deltaY < 0 ? 0.8 : 0.2),
  };
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let step = 1; step <= 12; step += 1) {
    await page.waitForTimeout(16);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + (deltaX * step) / 12,
          y: start.y + (deltaY * step) / 12,
        },
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();
}

async function waitForCategorySheetSnap(categorySheet: Locator) {
  await expect
    .poll(() =>
      categorySheet.evaluate((element) => {
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
        return Math.abs(
          translateY - (layout.getBoundingClientRect().height - visibleHeight),
        );
      }),
    )
    .toBeLessThan(1);
}

async function collapseEntry(page: Page) {
  const categorySheet = page.getByRole("dialog", {
    name: "Transaction entry",
  });
  const collapse = page.getByRole("button", {
    name: "Collapse transaction entry",
  });
  if (await collapse.isVisible()) {
    await collapse.click();
  }
  await waitForCategorySheetSnap(categorySheet);
}

async function expectActiveTitle(page: Page, label: string) {
  const activeLabel = await page
    .getByTestId("dashboard-title-reel")
    .locator('[data-testid="dashboard-title-reel-item"][data-active="true"]')
    .getAttribute("data-label");
  expect(activeLabel).toBe(label);
}

test.describe("Home dashboard carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((transactions: TransactionRecord[]) => {
      window.localStorage.setItem(
        "sheetlog.mock.transactions",
        JSON.stringify(transactions),
      );
    }, seededTransactions);
    await page.route("https://api.frankfurter.dev/v2/rates**", async (route) => {
      const rows = Array.from({ length: 30 }, (_, index) => ({
        date: format(subDays(new Date(), index), "yyyy-MM-dd"),
        base: "THB",
        quote: "USD",
        rate: 0.03,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
    });
    await page.goto("/app");
    await expect(page.getByRole("region", { name: "Home activity" })).toBeVisible();
  });

  test("uses the exact bounded Analytics, Transactions, Settings order with keyboard", async ({
    page,
  }) => {
    const viewport = page.getByTestId("home-carousel-viewport");
    const analytics = page.getByLabel("Analytics, slide 1 of 3");
    const transactions = page.getByLabel("Transactions, slide 2 of 3");
    const settings = page.getByLabel("Settings, slide 3 of 3");

    await expect(analytics).toHaveAttribute("aria-hidden", "false");
    await expect(transactions).toHaveAttribute("aria-hidden", "true");
    await expect(settings).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("button", { name: "Open settings" })).toHaveCount(0);
    await expectActiveTitle(page, "Analytics");

    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(analytics).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Analytics");
    await expect(viewport).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Transactions");

    await page.keyboard.press("ArrowRight");
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Settings");

    await page.keyboard.press("ArrowRight");
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Settings");

    await page.keyboard.press("ArrowLeft");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Transactions");

    await page.keyboard.press("ArrowLeft");
    await expect(analytics).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Analytics");
  });

  test("keeps Settings as an expandable Control Center with nested editors", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.use.hasTouch,
      "requires a touch-enabled browser context",
    );
    await collapseEntry(page);

    const viewport = page.getByTestId("home-carousel-viewport");
    const analytics = page.getByLabel("Analytics, slide 1 of 3");
    const transactions = page.getByLabel("Transactions, slide 2 of 3");
    const settings = page.getByLabel("Settings, slide 3 of 3");
    const categorySheet = page.getByTestId("category-step-layout");
    const dashboardHeader = page.getByTestId("dashboard-header");

    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("ArrowRight");
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expectActiveTitle(page, "Settings");

    const controlCenter = settings.getByTestId("settings-control-center-scroll");
    await expect(controlCenter).toHaveAttribute("data-dashboard-scroll", "true");
    await expect(settings.getByText("Everything is up to date")).toBeVisible();
    await expect(
      settings.getByText("Transaction history", { exact: true }),
    ).toHaveCount(0);

    await settings.locator("#settings-section-accounts > button").click();
    await settings.locator("#settings-section-categories > button").click();

    const accountsRegion = settings.locator("#settings-section-accounts-content");
    const categoriesRegion = settings.locator("#settings-section-categories-content");
    await expect(accountsRegion).toBeVisible();
    await expect(categoriesRegion).toBeVisible();
    await expect(
      accountsRegion.getByRole("button", { name: "Drag Cash to reorder" }),
    ).toHaveAttribute("data-home-carousel-swipe-lock", "true");
    await expect(
      categoriesRegion.getByRole("button", { name: /Drag .+ to reorder/ }).first(),
    ).toBeVisible();

    const addAccount = accountsRegion.getByRole("button", {
      name: "Add Account",
    });
    await addAccount.click();

    const editor = page.getByRole("dialog", { name: "New Account" });
    await expect(editor).toBeVisible();
    await expect(categorySheet).toBeVisible();
    await expect(categorySheet).toHaveAttribute(
      "data-category-sheet-state",
      "collapsed",
    );
    await expect(page.locator('[role="dialog"]')).toHaveCount(2);

    const accountName = editor.getByRole("textbox", {
      name: "Account name",
    });
    await accountName.fill("Travel Wallet");
    await touchSwipe(page, accountName, -180, 2);
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expect(accountName).toHaveValue("Travel Wallet");
    await accountName.press("Tab");
    await expect(editor.getByText("Saved", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "Close" }).click();
    await expect(editor).toHaveCount(0);
    await expect(
      accountsRegion.getByRole("button", { name: "Travel Wallet" }),
    ).toBeVisible();
    await expect(accountsRegion).toBeVisible();
    await expect(categoriesRegion).toBeVisible();

    await addAccount.click();
    const invalidEditor = page.getByRole("dialog", { name: "New Account" });
    const invalidName = invalidEditor.getByRole("textbox", {
      name: "Account name",
    });
    await invalidName.fill("Cash");
    await invalidName.press("Tab");
    await expect(
      invalidEditor.getByText("An account named Cash already exists."),
    ).toBeVisible();
    await invalidEditor.getByRole("button", { name: "Close" }).click();
    await expect(invalidEditor).toBeVisible();
    await expect(invalidName).toBeFocused();
    await invalidEditor.getByRole("button", { name: "Revert" }).click();
    await expect(invalidEditor).toHaveCount(0);

    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("ArrowLeft");
    await expect(analytics).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("ArrowRight");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("ArrowRight");
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expect(accountsRegion).toBeVisible();
    await expect(categoriesRegion).toBeVisible();

    await settings.locator("#settings-section-data-sync > button").click();
    await expect(
      settings.getByText("Transaction history", { exact: true }),
    ).toBeVisible();
    await expect(settings.getByText(/^17 transactions · Last saved /)).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Resync transaction history" }),
    ).toBeVisible();

    await controlCenter.evaluate((element) => {
      element.scrollTop = 34;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect
      .poll(() =>
        dashboardHeader.evaluate((element) =>
          Number((element as HTMLElement).dataset.hideProgress),
        ),
      )
      .toBeCloseTo(0.5, 2);

    await expect(page.getByRole("button", { name: "Open settings" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close settings" })).toHaveCount(0);
  });

  test("keeps the Transactions dock tied to slide 2 and preserves its search state", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.use.hasTouch,
      "requires a touch-enabled browser context",
    );
    await collapseEntry(page);

    const viewport = page.getByTestId("home-carousel-viewport");
    const analytics = page.getByLabel("Analytics, slide 1 of 3");
    const transactions = page.getByLabel("Transactions, slide 2 of 3");
    const settings = page.getByLabel("Settings, slide 3 of 3");
    const dock = page.getByTestId("transaction-history-dock");

    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await expect(dock).toHaveAttribute("aria-hidden", "false");
    await expect(dock).not.toHaveAttribute("inert");

    const search = dock.getByRole("searchbox", {
      name: "Search transaction history",
    });
    await search.fill("lunch");
    await expect(
      transactions.getByText("Food Delivery", { exact: true }),
    ).toBeVisible();
    await expect(
      dock.getByTestId("transaction-history-metadata"),
    ).toHaveCount(0);

    await touchSwipe(page, search, -140, 2);
    await expect(transactions).toHaveAttribute("aria-hidden", "false");

    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expect(dock).toHaveAttribute("aria-hidden", "true");
    await expect(dock).toHaveAttribute("inert", "");

    await page.keyboard.press("ArrowLeft");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await expect(search).toHaveValue("lunch");
    await expect(dock).toHaveAttribute("aria-hidden", "false");

    await page.keyboard.press("ArrowLeft");
    await expect(analytics).toHaveAttribute("aria-hidden", "false");
    await expect(dock).toHaveAttribute("aria-hidden", "true");
  });

  test("collapses the shared header independently from Transactions scrolling", async ({
    page,
  }) => {
    await collapseEntry(page);
    const viewport = page.getByTestId("home-carousel-viewport");
    const transactions = page.getByLabel("Transactions, slide 2 of 3");
    const dashboardHeader = page.getByTestId("dashboard-header");

    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");

    const history = page.getByRole("region", { name: "Transaction history" });
    await history.evaluate((element) => {
      element.scrollTop = 34;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect
      .poll(() =>
        dashboardHeader.evaluate((element) =>
          Number((element as HTMLElement).dataset.hideProgress),
        ),
      )
      .toBeCloseTo(0.5, 2);

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByLabel("Analytics, slide 1 of 3")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await expect(dashboardHeader).toHaveAttribute("data-hide-progress", "0.000");

    await page.keyboard.press("ArrowRight");
    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await expect
      .poll(() =>
        dashboardHeader.evaluate((element) =>
          Number((element as HTMLElement).dataset.hideProgress),
        ),
      )
      .toBeCloseTo(0.5, 2);
  });

  test("keeps category entry usable over the three-slide carousel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 440 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    const categorySheet = page.getByRole("dialog", { name: "Transaction entry" });
    await waitForCategorySheetSnap(categorySheet);

    const entry = page.getByTestId("category-step-entry");
    const geometry = await entry.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    await touchSwipe(page, entry, 0, -160);
    await expect
      .poll(() => entry.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: "Collapse transaction entry" }),
    ).toBeVisible();
  });
});
