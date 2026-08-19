import {
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
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

type SwipeDirection = "left" | "right";

async function swipeHorizontally(
  page: Page,
  target: Locator,
  direction: SwipeDirection,
) {
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Cannot swipe a target without a visible bounding box");
  }

  const session = await page.context().newCDPSession(page);
  const startX = box.x + box.width * (direction === "left" ? 0.78 : 0.22);
  const endX = box.x + box.width * (direction === "left" ? 0.22 : 0.78);
  const y = box.y + Math.min(Math.max(box.height * 0.45, 80), box.height - 80);
  const touchPoint = (x: number) => ({
    x,
    y,
    radiusX: 2,
    radiusY: 2,
    force: 1,
    id: 1,
  });

  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(startX)],
    });
    for (let step = 1; step <= 12; step += 1) {
      const progress = step / 12;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touchPoint(startX + (endX - startX) * progress)],
      });
      await page.waitForTimeout(16);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

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

  test("projects fractional native scroll without committing during an active touch", async ({
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

    const wheelOwnership = await viewport.evaluate((element) => {
      const horizontal = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 120,
        deltaY: 10,
      });
      const vertical = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 10,
        deltaY: 120,
      });
      element.dispatchEvent(horizontal);
      element.dispatchEvent(vertical);
      return {
        horizontalPrevented: horizontal.defaultPrevented,
        verticalPrevented: vertical.defaultPrevented,
      };
    });
    expect(wheelOwnership).toEqual({
      horizontalPrevented: true,
      verticalPrevented: false,
    });

    await viewport.evaluate(async (element) => {
      const viewportElement = element as HTMLElement;
      viewportElement.style.scrollSnapType = "none";
      viewportElement.style.scrollBehavior = "auto";
      viewportElement.dispatchEvent(
        new Event("touchstart", { bubbles: true, cancelable: true }),
      );
      viewportElement.scrollLeft = viewportElement.clientWidth / 2;
      viewportElement.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
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
      viewportElement.dispatchEvent(
        new Event("touchend", { bubbles: true, cancelable: true }),
      );
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

  test("chains horizontal touch from nested vertical screens to the pager", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Mobile Chrome",
      "Real touch dispatch covers the Android Chromium project",
    );

    const viewport = page.getByTestId("home-carousel-viewport");
    await viewport.press("ArrowRight");
    await expect(viewport).toHaveAttribute("data-selected-snap", "1");

    const transactionHistory = page.getByLabel("Transaction history");
    await expect(transactionHistory).toBeVisible();
    await swipeHorizontally(page, transactionHistory, "left");
    await expect(viewport).toHaveAttribute("data-selected-snap", "2");

    const settings = page.getByTestId("settings-scroll-main");
    await expect(settings).toBeVisible();
    await swipeHorizontally(page, settings, "right");
    await expect(viewport).toHaveAttribute("data-selected-snap", "1");

    await swipeHorizontally(page, transactionHistory, "right");
    await expect(viewport).toHaveAttribute("data-selected-snap", "0");
  });
});
