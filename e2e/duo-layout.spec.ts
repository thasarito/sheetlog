import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.DUO_TEST_BASE_URL ?? "http://127.0.0.1:5174" });

test("the wide workspace keeps transaction entry beside the selected page", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 669 });
  await page.goto("/e2e/duo-fixtures.html?screen=entry");

  const navigation = page.getByRole("navigation", { name: "Tracker navigation" });
  const entry = page.getByRole("region", { name: "Transaction entry workspace" });
  await expect(navigation).toBeVisible();
  await expect(entry).toBeVisible();

  await navigation.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.getByRole("region", { name: /Transactions, slide 2 of 3/ })).toBeVisible();
  await expect(entry).toBeVisible();

  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Settings", exact: true })).toBeVisible();
  await expect(entry).toBeVisible();
});

test("a draft transaction survives changing between wide and compact layouts", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 669 });
  await page.goto("/e2e/duo-fixtures.html?screen=entry");

  const entry = page.getByRole("region", { name: "Transaction entry workspace" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: /Dining Out/ }).click();
  await page.getByRole("button", { name: "Done" }).click();
  const note = page.getByLabel("Transaction note");
  await expect(note).toBeVisible();
  await note.fill("Lunch with friends");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(note).toHaveValue("Lunch with friends");
  await expect(page.locator(".duo-dashboard-panel")).toHaveAttribute("inert", "");
  await page.setViewportSize({ width: 951, height: 669 });
  await expect(note).toHaveValue("Lunch with friends");
  await expect(page.locator(".duo-dashboard-panel")).not.toHaveAttribute("inert", "");
});

test("setup content remains readable on the open display", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 669 });
  await page.goto("/e2e/duo-fixtures.html?screen=connect");
  const content = page.getByRole("main");
  await expect(content).toBeVisible();
  const bounds = await content.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(720);
});

test("navigation and the second pane appear at their intended breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 599, height: 800 });
  await page.goto("/e2e/duo-fixtures.html?screen=entry");
  const navigation = page.getByRole("navigation", { name: "Tracker navigation" });
  const layout = page.getByTestId("category-step-layout");
  await expect(navigation).toBeHidden();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(navigation).toBeVisible();
  await expect(layout).toHaveAttribute("data-duo-wide", "false");
  await page.setViewportSize({ width: 768, height: 800 });
  await expect(layout).toHaveAttribute("data-duo-wide", "true");
});

test("wide amount, receipt, and settings screens keep controls readable", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 543 });
  await page.goto("/e2e/duo-fixtures.html?screen=amount");
  const amount = page.getByTestId("step-amount");
  await expect(amount).toBeVisible();
  expect((await amount.boundingBox())?.width).toBeLessThanOrEqual(720);
  const note = page.getByLabel("Transaction note");
  const account = page.getByText("Account", { exact: true });
  const noteBox = await note.boundingBox();
  const accountBox = await account.boundingBox();
  if (!noteBox || !accountBox) throw new Error("Amount fields must be visible");
  expect(noteBox.y).toBeGreaterThanOrEqual(accountBox.y + accountBox.height);
  expect(await note.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const container = element.closest("[data-step-amount-fields]");
    if (!container) return false;
    const bounds = container.getBoundingClientRect();
    return rect.bottom <= bounds.bottom && rect.top >= bounds.top;
  })).toBe(true);

  await page.goto("/e2e/duo-fixtures.html?screen=receipt");
  const summary = await page.getByTestId("receipt-amount-card").boundingBox();
  const sync = await page.getByTestId("receipt-timeline-step-sync").boundingBox();
  const done = await page.getByRole("button", { name: "Done" }).boundingBox();
  if (!summary || !sync || !done) throw new Error("Receipt content must be visible");
  expect(summary.width).toBeLessThanOrEqual(500);
  expect(sync.y + sync.height).toBeLessThanOrEqual(done.y);
  await page.goto("/e2e/duo-fixtures.html?screen=settings");
  expect((await page.getByRole("region", { name: "Workspace health" }).boundingBox())?.width).toBeLessThanOrEqual(720);
});

test("category labels remain readable on the closed display", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto("/e2e/duo-fixtures.html?screen=entry");
  const label = page.getByRole("button", { name: "Groceries & Home Supplies" }).locator("span").last();
  await expect(label).toBeVisible();
  expect(await label.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
});

test("short compact amount screens keep the note and keypad reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/e2e/duo-fixtures.html?screen=amount");
  const note = page.getByLabel("Transaction note");
  await note.fill("A note on a short screen");
  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(note).toHaveValue("A note on a short screen");
  const submit = page.getByRole("button", { name: "Submit" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
});

test("the theme popup fits inside the settings pane at the wide breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 700 });
  await page.goto("/e2e/duo-fixtures.html?screen=entry");
  await page.getByRole("navigation", { name: "Tracker navigation" }).getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Theme settings" }).click();
  const popup = page.getByRole("button", { name: "Close theme settings" }).locator("xpath=preceding-sibling::div");
  const shell = page.locator(".settings-view-shell");
  const popupBox = await popup.boundingBox();
  const shellBox = await shell.boundingBox();
  if (!popupBox || !shellBox) throw new Error("Theme popup must be visible");
  expect(popupBox.x).toBeGreaterThanOrEqual(shellBox.x);
});
