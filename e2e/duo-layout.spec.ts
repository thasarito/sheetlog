import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.DUO_TEST_BASE_URL ?? "http://127.0.0.1:5174" });

test("the wide workspace keeps transaction entry beside the selected page", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 669 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Tracker navigation" });
  const entry = page.getByRole("region", { name: "Transaction entry workspace" });
  await expect(navigation).toBeVisible();
  await expect(entry).toBeVisible();

  await navigation.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.getByText("No transactions yet.")).toBeVisible();
  await expect(entry).toBeVisible();

  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Settings", exact: true })).toBeVisible();
  await expect(entry).toBeVisible();
});

test("a draft transaction survives changing between wide and compact layouts", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 669 });
  await page.goto("/");

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
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Tracker navigation" });
  const layout = page.getByTestId("category-step-layout");
  await expect(navigation).toBeHidden();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(navigation).toBeVisible();
  await expect(layout).toHaveAttribute("data-duo-wide", "false");
  await page.setViewportSize({ width: 768, height: 800 });
  await expect(layout).toHaveAttribute("data-duo-wide", "true");
});
