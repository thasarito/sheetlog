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
  transaction("rent", 3, "expense", 480, "Rent & Utilities"),
  transaction("health", 4, "expense", 200, "Health"),
  transaction("books", 5, "expense", 90, "Books"),
  transaction("savings", 0, "transfer", 300, "Savings"),
  ...Array.from({ length: 16 }, (_, index) =>
    transaction(
      `history-${index}`,
      index + 3,
      "expense",
      20 + index,
      "Groceries & Home Supplies",
    ),
  ),
];

let frankfurterRequestCount = 0;
let releaseBackgroundRates: (() => void) | null = null;

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
  if (horizontal) {
    await client.send("Input.synthesizeScrollGesture", {
      x: box.x + box.width * (deltaX < 0 ? 0.85 : 0.15),
      y: box.y + box.height * 0.65,
      xDistance: deltaX,
      yDistance: deltaY,
      gestureSourceType: "touch",
      speed: 900,
    });
    await client.detach();
    return;
  }
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

async function touchSwipeWithMotionTrace(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  await target.evaluate((element) => {
    const track = element.querySelector<HTMLElement>(
      '[data-testid="analytics-period-track"]',
    );
    if (!track) throw new Error("Analytics period motion track is missing");
    const motionElement = element as HTMLElement & {
      __analyticsPeriodMotionTrace?: {
        transforms: string[];
        selectedOffsets: Array<string | null>;
        touchEvents: { start: number; move: number; end: number; cancel: number };
        done: boolean;
      };
    };
    const trace = {
      transforms: [] as string[],
      selectedOffsets: [] as Array<string | null>,
      touchEvents: { start: 0, move: 0, end: 0, cancel: 0 },
      done: false,
    };
    motionElement.__analyticsPeriodMotionTrace = trace;
    element.addEventListener("touchstart", () => {
      trace.touchEvents.start += 1;
    });
    element.addEventListener("touchmove", () => {
      trace.touchEvents.move += 1;
    });
    element.addEventListener("touchend", () => {
      trace.touchEvents.end += 1;
    });
    element.addEventListener("touchcancel", () => {
      trace.touchEvents.cancel += 1;
    });

    const sampleFrame = () => {
      trace.transforms.push(track.style.transform);
      trace.selectedOffsets.push(
        element
          .querySelector('[role="option"][aria-selected="true"]')
          ?.getAttribute("data-period-offset") ?? null,
      );
      if (trace.transforms.length >= 120) {
        trace.done = true;
        return;
      }
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
  });

  const client = await page.context().newCDPSession(page);
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  const startX =
    box.x + box.width * (deltaX < 0 ? 0.85 : deltaX > 0 ? 0.15 : 0.5);
  const startY =
    box.y + box.height * (horizontal ? 0.65 : deltaY < 0 ? 0.8 : 0.2);
  const touchPoint = (x: number, y: number) => ({
    x,
    y,
    id: 0,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(startX, startY)],
  });
  for (let step = 1; step <= 16; step += 1) {
    await page.waitForTimeout(16);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        touchPoint(
          startX + (deltaX * step) / 16,
          startY + (deltaY * step) / 16,
        ),
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();

  return target.evaluate(async (element) => {
    const motionElement = element as HTMLElement & {
      __analyticsPeriodMotionTrace?: {
        transforms: string[];
        selectedOffsets: Array<string | null>;
        touchEvents: { start: number; move: number; end: number; cancel: number };
        done: boolean;
      };
    };
    const trace = motionElement.__analyticsPeriodMotionTrace;
    if (!trace) {
      throw new Error("Analytics period motion trace was not initialized");
    }
    while (!trace.done) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    delete motionElement.__analyticsPeriodMotionTrace;
    return trace;
  });
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
        return Math.abs(translateY - (window.innerHeight - visibleHeight));
      }),
    )
    .toBeLessThan(1);
}

test.describe("Home Transactions and Analytics carousel", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    frankfurterRequestCount = 0;
    releaseBackgroundRates = null;
    const delayBackgroundRates = testInfo.title.includes(
      "keeps analytics usable while rates fill in the background",
    );
    let releaseRatesPromise: Promise<void> | null = null;
    if (delayBackgroundRates) {
      releaseRatesPromise = new Promise<void>((resolve) => {
        releaseBackgroundRates = resolve;
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((transactions: TransactionRecord[]) => {
      window.localStorage.setItem(
        "sheetlog.mock.transactions",
        JSON.stringify(transactions),
      );
    }, seededTransactions);
    await page.route(
      "https://api.frankfurter.dev/v2/rates**",
      async (route) => {
        frankfurterRequestCount += 1;
        if (releaseRatesPromise) await releaseRatesPromise;
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
      },
    );
    await page.goto("/app");
    await expect(
      page.getByRole("region", { name: "Home activity" }),
    ).toBeVisible();
  });

  test("keeps analytics usable while rates fill in the background", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: "Collapse transaction entry" })
      .click();
    await waitForCategorySheetSnap(
      page.getByRole("dialog", { name: "Transaction entry" }),
    );
    const analyticsSlide = page.getByLabel("Analytics, slide 1 of 2");
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "false");
    const analyticsUpdate = analyticsSlide.getByLabel(
      "Analytics summary update",
    );

    await expect.poll(() => frankfurterRequestCount).toBe(1);
    await expect(analyticsUpdate).toContainText("Expenses ฿200");
    await page.getByRole("button", { name: "Month" }).click();
    await page.getByRole("button", { name: "Quarter" }).click();
    await page.getByRole("button", { name: "Year" }).click();
    await page.getByRole("button", { name: "Week" }).click();
    expect(frankfurterRequestCount).toBe(1);

    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page.getByText("Syncing…", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    releaseBackgroundRates?.();
    releaseBackgroundRates = null;
    await expect(analyticsUpdate).toContainText("Expenses ฿300");
    expect(frankfurterRequestCount).toBe(1);

    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page.getByText(/^Synced · /)).toBeVisible();
    const requestsBeforeResync = frankfurterRequestCount;
    await page.getByRole("button", { name: "Resync analytics" }).click();
    await expect
      .poll(() => frankfurterRequestCount)
      .toBeGreaterThan(requestsBeforeResync);
    await expect(page.getByText(/^Synced · /)).toBeVisible();
  });

  test("keeps category controls scrollable on a short viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 520 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));

    const categorySheet = page.getByRole("dialog", {
      name: "Transaction entry",
    });
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

  test("keeps the carousel viewport focused across keyboard slide changes", async ({
    page,
  }) => {
    const viewport = page.getByTestId("home-carousel-viewport");
    const analyticsSlide = page.getByLabel("Analytics, slide 1 of 2");
    const transactionSlide = page.getByLabel("Transactions, slide 2 of 2");

    await expect(
      page.getByRole("button", { name: "Transactions slide" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Analytics slide" }),
    ).toHaveCount(0);
    await viewport.focus();
    await expect(viewport).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "false");
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "true");
    await expect(viewport).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "false");
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "true");
    await expect(viewport).toBeFocused();
  });

  test("keeps the bottom safe area below entry content at both snaps", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const installStyle = () => {
        if (!document.head || document.querySelector("#safe-area-test-style")) {
          return false;
        }
        const style = document.createElement("style");
        style.id = "safe-area-test-style";
        style.textContent =
          "[data-vaul-drawer] { --category-sheet-safe-area: 24px !important; }";
        document.head.append(style);
        return true;
      };
      if (!installStyle()) {
        const observer = new MutationObserver(() => {
          if (installStyle()) observer.disconnect();
        });
        observer.observe(document, { childList: true, subtree: true });
      }
    });
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Home activity" }),
    ).toBeVisible();
    const categorySheet = page.getByRole("dialog", {
      name: "Transaction entry",
    });
    const launcher = page.getByTestId("category-step-launcher");
    const entry = page.getByTestId("category-step-entry");
    const safeArea = page.getByTestId("category-step-safe-area");
    await waitForCategorySheetSnap(categorySheet);

    const expanded = await Promise.all([
      entry.boundingBox(),
      safeArea.boundingBox(),
    ]);
    if (!expanded[0] || !expanded[1]) {
      throw new Error("Expanded category sheet geometry missing");
    }
    expect(expanded[1].height).toBeCloseTo(24, 3);
    expect(expanded[0].y + expanded[0].height).toBeLessThanOrEqual(
      expanded[1].y + 1,
    );
    expect(Math.abs(expanded[1].y + expanded[1].height - 844)).toBeLessThanOrEqual(
      1.5,
    );

    await page
      .getByRole("button", { name: "Collapse transaction entry" })
      .click();
    await waitForCategorySheetSnap(categorySheet);
    const collapsed = await Promise.all([
      launcher.boundingBox(),
      safeArea.boundingBox(),
    ]);
    if (!collapsed[0] || !collapsed[1]) {
      throw new Error("Collapsed category sheet geometry missing");
    }
    expect(collapsed[0].y + collapsed[0].height).toBeLessThanOrEqual(
      collapsed[1].y + 1,
    );
    expect(
      Math.abs(collapsed[1].y + collapsed[1].height - 844),
    ).toBeLessThanOrEqual(1.5);
  });

  test("disables category snap transitions for reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const categorySheet = page.getByRole("dialog", {
      name: "Transaction entry",
    });
    await page
      .getByRole("button", { name: "Collapse transaction entry" })
      .click();

    await expect
      .poll(() =>
        categorySheet.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.transitionProperty} ${style.transitionDuration}`;
        }),
      )
      .toBe("none 0s");
  });

  test("layers category entry over both full review slides", async ({
    page,
  }, testInfo) => {
    const viewport = page.getByTestId("home-carousel-viewport");
    const analyticsSlide = page.getByLabel("Analytics, slide 1 of 2");
    const transactionSlide = page.getByLabel("Transactions, slide 2 of 2");
    const transactionHeading = transactionSlide.getByRole("heading", {
      name: "Transactions",
      includeHidden: true,
    });
    const analyticsHeading = analyticsSlide.getByRole("heading", {
      name: "Analytics",
    });
    const categorySheet = page.getByRole("dialog", {
      name: "Transaction entry",
    });

    await expect(categorySheet).toBeVisible();
    await waitForCategorySheetSnap(categorySheet);
    await expect(
      page.getByRole("button", { name: "Transactions slide" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Analytics slide" }),
    ).toHaveCount(0);
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "false");
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "true");
    await expect(analyticsHeading).toBeVisible();
    expect(
      await analyticsHeading.evaluate((heading) => {
        const section = heading.closest("section");
        if (!section) throw new Error("Analytics title section missing");
        return getComputedStyle(section).backgroundColor;
      }),
    ).toBe("rgba(0, 0, 0, 0)");
    expect(
      await transactionHeading.evaluate((heading) => {
        const section = heading.closest("section");
        if (!section) throw new Error("Transactions title section missing");
        return getComputedStyle(section).backgroundColor;
      }),
    ).toBe("rgba(0, 0, 0, 0)");
    const transactionTitleBefore = await transactionHeading.boundingBox();
    if (!transactionTitleBefore) {
      throw new Error("Transactions title geometry missing before navigation");
    }
    const viewportBox = await viewport.boundingBox();
    if (!viewportBox) throw new Error("Carousel viewport geometry missing");
    expect(transactionTitleBefore.x).toBeGreaterThanOrEqual(
      viewportBox.x + viewportBox.width,
    );
    await expect(
      page.getByRole("button", { name: "View all transactions" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "View all analytics" }),
    ).toHaveCount(0);
    await expect(page.locator("[data-vaul-overlay]")).toHaveCount(0);
    expect(
      await categorySheet.evaluate((element) =>
        getComputedStyle(element).boxShadow,
      ),
    ).toBe("none");

    await page.screenshot({
      path: testInfo.outputPath("category-expanded-analytics.png"),
      scale: "css",
    });

    const collapseEntry = page.getByRole("button", {
      name: "Collapse transaction entry",
    });
    await touchSwipe(page, collapseEntry, 0, 360);
    const expandEntry = page.getByRole("button", {
      name: "Expand transaction entry",
    });
    await expect(expandEntry).toBeVisible();
    await expect(page.getByText("Log transaction", { exact: true })).toBeVisible();
    await waitForCategorySheetSnap(categorySheet);
    await page.screenshot({
      path: testInfo.outputPath("category-collapsed-analytics.png"),
      scale: "css",
    });

    const periodPicker = page.getByTestId("analytics-period-picker");
    const selectedPeriod = periodPicker.getByRole("option", {
      selected: true,
    });
    const periodBefore = await selectedPeriod.getAttribute(
      "data-period-offset",
    );
    const motionTrace = await touchSwipeWithMotionTrace(
      page,
      periodPicker,
      180,
      2,
    );
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "false");
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "true");
    expect(motionTrace.touchEvents.start).toBe(1);
    expect(motionTrace.touchEvents.move).toBeGreaterThan(3);
    expect(motionTrace.touchEvents.end).toBe(1);
    expect(motionTrace.touchEvents.cancel).toBe(0);
    expect(new Set(motionTrace.transforms.filter(Boolean)).size).toBeGreaterThan(3);
    await expect(selectedPeriod).not.toHaveAttribute(
      "data-period-offset",
      periodBefore ?? "",
    );

    await page.getByRole("button", { name: "Custom date range" }).click();
    const rangeDialog = page.getByRole("dialog", {
      name: "Custom date range",
    });
    await expect(rangeDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(rangeDialog).toHaveCount(0);

    const pageWidth = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(pageWidth.body).toBe(pageWidth.viewport);

    await touchSwipe(page, expandEntry, 0, -360);
    await expect(collapseEntry).toBeVisible();
    await waitForCategorySheetSnap(categorySheet);
    await categorySheet
      .getByRole("button", { name: "Food Delivery", exact: true })
      .click();
    const dateTimeDialog = page.getByRole("dialog", { name: "Date & time" });
    await expect(dateTimeDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dateTimeDialog).toHaveCount(0);
    await waitForCategorySheetSnap(categorySheet);
    await collapseEntry.click();
    await expect(expandEntry).toBeVisible();
    await waitForCategorySheetSnap(categorySheet);

    await touchSwipe(page, viewport, -260, 4);
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "false");
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "true");
    const transactionTitleAfter = await transactionHeading.boundingBox();
    if (!transactionTitleAfter) {
      throw new Error("Transactions title geometry missing after navigation");
    }
    expect(transactionTitleBefore.x).toBeGreaterThan(
      transactionTitleAfter.x + 200,
    );
    await expect(transactionHeading).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("category-collapsed-transactions.png"),
      scale: "css",
    });

    const historyRegion = page.getByRole("region", {
      name: "Transaction history",
    });
    const historyGeometry = await historyRegion.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(historyGeometry.scrollHeight).toBeGreaterThan(
      historyGeometry.clientHeight,
    );
    const before = await historyRegion.evaluate((element) => element.scrollTop);
    await touchSwipe(page, historyRegion, 2, -240);
    await expect
      .poll(() => historyRegion.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before);
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "false");
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "true");

    const search = page.getByRole("searchbox", {
      name: "Search transaction history",
    });
    await search.fill("lunch");
    await expect(
      historyRegion.getByRole("button", {
        name: /expense Food Delivery Lunch/,
      }),
    ).toBeVisible();
    await expect(
      historyRegion.getByRole("button", { name: /income Salary/ }),
    ).toHaveCount(0);
    await search.fill("");

    await touchSwipe(page, viewport, 260, 4);
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "false");
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "true");
    await expect(analyticsHeading).toBeVisible();

    await touchSwipe(page, viewport, -260, 4);
    await expect(transactionSlide).toHaveAttribute("aria-hidden", "false");
    await expect(analyticsSlide).toHaveAttribute("aria-hidden", "true");
    const reviewRow = page.getByRole("button", {
      name: /expense Food Delivery.*Lunch/,
    });
    await expect(reviewRow).toBeVisible();
    await reviewRow.click();
    await expect(page.getByPlaceholder("Add a note...")).toHaveValue("Lunch");
    await expect(page.getByTestId("category-step-layout")).toHaveCount(0);
  });
});
