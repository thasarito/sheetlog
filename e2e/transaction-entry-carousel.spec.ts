import { expect, test, type Locator, type Page } from "@playwright/test";

async function touchSwipe(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY = 3,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const client = await page.context().newCDPSession(page);
  const start = {
    x: box.x + box.width * (deltaX < 0 ? 0.85 : 0.15),
    y: box.y + box.height * 0.5,
  };
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + (deltaX * step) / 8,
          y: start.y + (deltaY * step) / 8,
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

async function seedQuickNote(page: Page) {
  await page.evaluate(async () => {
    const value = JSON.stringify({
      "expense:Food Delivery": [
        {
          id: "breakfast",
          icon: "Coffee",
          label: "Breakfast",
          note: "Breakfast",
        },
      ],
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("SheetLogDB");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("settings", "readwrite");
        transaction.objectStore("settings").put({
          key: "quickNotes",
          value,
          updatedAt: new Date().toISOString(),
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
}

test.describe("Transaction type and category carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("transaction-type-carousel")).toBeVisible();
  });

  test("swipes from a category, keeps finite bounds, and preserves tap behavior", async ({
    page,
  }) => {
    const viewport = page.getByTestId("transaction-type-carousel");
    const expenseSlide = page.getByLabel("Expense categories, slide 1 of 3");
    const grid = expenseSlide.getByTestId("category-grid");
    const firstTile = expenseSlide.getByRole("button", {
      name: "Food Delivery",
    });

    const geometry = await grid.evaluate((element) => {
      const tile = element.querySelector("button");
      if (!tile) throw new Error("Category tile missing");
      const tileRect = tile.getBoundingClientRect();
      const gridStyle = getComputedStyle(element);
      return {
        width: tileRect.width,
        height: tileRect.height,
        columns: gridStyle.gridTemplateColumns.split(" ").length,
        gap: gridStyle.columnGap,
        boxShadow: getComputedStyle(tile).boxShadow,
      };
    });
    expect(Math.abs(geometry.width - geometry.height)).toBeLessThan(1);
    expect(geometry.columns).toBe(4);
    expect(geometry.gap).toBe("8px");
    expect(geometry.boxShadow).toBe("none");

    const tabGeometry = await page
      .getByTestId("animated-tabs-compact")
      .evaluate((element) => {
        const button = element.querySelector("button");
        if (!button) throw new Error("Transaction type button missing");
        return {
          controlHeight: element.getBoundingClientRect().height,
          buttonHeight: button.getBoundingClientRect().height,
          boxShadow: getComputedStyle(element).boxShadow,
        };
      });
    expect(tabGeometry.controlHeight).toBe(52);
    expect(tabGeometry.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(tabGeometry.boxShadow).toBe("none");

    await touchSwipe(page, viewport, 3, -120);
    await expect(page.getByRole("button", { name: "Expense" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await touchSwipe(
      page,
      expenseSlide.getByRole("button", { name: "Coffee & Snacks" }),
      -260,
    );
    await expect(page.getByRole("button", { name: "Income" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Bonus", { exact: true })).toBeVisible();

    await touchSwipe(page, viewport, -260);
    await expect(page.getByRole("button", { name: "Transfer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await touchSwipe(page, viewport, -260);
    await expect(page.getByRole("button", { name: "Transfer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Expense" }).click();
    await expect(firstTile).toBeVisible();
    await firstTile.click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: "Date & time" }),
    ).toBeVisible();
  });

  test("keeps the long-press quick-note gesture", async ({ page }) => {
    await seedQuickNote(page);
    await page.reload();
    const tile = page.getByRole("button", { name: "Food Delivery" });
    const box = await tile.boundingBox();
    if (!box) throw new Error("Food Delivery tile missing");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await expect(page.getByText("Breakfast", { exact: true })).toBeVisible();
    await page.mouse.up();
  });

  test("keeps an empty nearby-place slot in the amount step", async ({ page }) => {
    await page.getByRole("button", { name: "Food Delivery" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    const slot = page.getByTestId("nearby-place-slot");
    await expect(slot).toBeVisible();
    expect((await slot.boundingBox())?.height).toBeGreaterThanOrEqual(42);
    await expect(slot.getByRole("button")).toHaveCount(0);
  });

  test("uses the Graphite Indigo semantic palette in dark mode", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      return {
        background: read("--background"),
        foreground: read("--foreground"),
        surface: read("--surface"),
        surface2: read("--surface-2"),
        surface3: read("--surface-3"),
        primary: read("--primary"),
        mutedForeground: read("--muted-foreground"),
        border: read("--border"),
      };
    });

    expect(tokens).toEqual({
      background: "230 16% 7%",
      foreground: "240 33% 98%",
      surface: "229 19% 12%",
      surface2: "229 19% 17%",
      surface3: "228 21% 24%",
      primary: "229 100% 78%",
      mutedForeground: "230 17% 74%",
      border: "228 18% 27%",
    });
  });
});
