import { expect, test } from "@playwright/test";
import { format, subDays } from "date-fns";
import type { TransactionRecord } from "../src/lib/types";

const seededTransaction: TransactionRecord = {
  id: "native-scroll-expense",
  type: "expense",
  amount: 120,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Dining Out",
  date: format(new Date(), "yyyy-MM-dd'T'12:00:00"),
  status: "synced",
  createdAt: format(new Date(), "yyyy-MM-dd'T'12:00:00"),
  updatedAt: format(new Date(), "yyyy-MM-dd'T'12:00:00"),
};

test.describe("Native dashboard scroll snap", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((transactions: TransactionRecord[]) => {
      window.localStorage.setItem(
        "sheetlog.mock.transactions",
        JSON.stringify(transactions),
      );
    }, [seededTransaction]);
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
    await expect(
      page.getByRole("region", { name: "Home activity" }),
    ).toBeVisible();
  });

  test("projects fractional native scroll into the title before semantic settle", async ({
    page,
  }) => {
    const viewport = page.getByTestId("home-carousel-viewport");
    const reel = page.getByTestId("dashboard-title-reel");
    const analytics = page.getByLabel("Analytics, slide 1 of 3");
    const transactions = page.getByLabel("Transactions, slide 2 of 3");

    await expect
      .poll(() =>
        viewport.evaluate((element) => ({
          overflowX: getComputedStyle(element).overflowX,
          scrollSnapType: getComputedStyle(element).scrollSnapType,
        })),
      )
      .toEqual({ overflowX: "auto", scrollSnapType: "x mandatory" });

    await viewport.evaluate(async (element) => {
      const viewportElement = element as HTMLElement;
      viewportElement.style.scrollSnapType = "none";
      viewportElement.style.scrollBehavior = "auto";
      viewportElement.scrollLeft = viewportElement.clientWidth / 2;
      viewportElement.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    await expect(viewport).toHaveAttribute("data-motion-position", "0.500");
    await expect(viewport).toHaveAttribute("data-motion-status", "moving");
    await expect(reel).toHaveAttribute("data-position", "0.500");
    await expect(reel).toHaveAttribute("data-selected-label", "Analytics");
    await expect(analytics).toHaveAttribute("aria-hidden", "false");
    await expect(transactions).toHaveAttribute("aria-hidden", "true");

    await viewport.evaluate(async (element) => {
      const viewportElement = element as HTMLElement;
      viewportElement.scrollLeft = viewportElement.clientWidth;
      viewportElement.dispatchEvent(new Event("scroll", { bubbles: true }));
      viewportElement.dispatchEvent(new Event("scrollend"));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    await expect(transactions).toHaveAttribute("aria-hidden", "false");
    await expect(analytics).toHaveAttribute("aria-hidden", "true");
    await expect(viewport).toHaveAttribute("data-motion-position", "1.000");
    await expect(viewport).toHaveAttribute("data-motion-status", "settled");
    await expect(reel).toHaveAttribute("data-position", "1.000");
    await expect(reel).toHaveAttribute("data-selected-label", "Transactions");
  });
});
