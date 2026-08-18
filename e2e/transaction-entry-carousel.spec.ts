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
          id: "ios-snap-target",
          icon: "Coffee",
          label: "iOS Snap 73",
          note: "iOS snap target selected",
          amount: "73.21",
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

async function readCategoryContrast(page: Page) {
  return page
    .getByLabel("Expense categories, slide 1 of 3")
    .getByTestId("category-grid")
    .evaluate((grid) => {
      const channels = (color: string) => {
        const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        return color.startsWith("color(srgb")
          ? values
          : values.map((value) => value / 255);
      };
      const channel = (normalized: number) => {
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (color: string) => {
        const [red = 0, green = 0, blue = 0] = channels(color);
        return (
          0.2126 * channel(red) +
          0.7152 * channel(green) +
          0.0722 * channel(blue)
        );
      };
      const contrast = (first: string, second: string) => {
        const lighter = Math.max(luminance(first), luminance(second));
        const darker = Math.min(luminance(first), luminance(second));
        return (lighter + 0.05) / (darker + 0.05);
      };

      return [...grid.querySelectorAll("button")].map((tile) => {
        const label = tile.querySelector("span:last-child");
        const icon = tile.querySelector("svg");
        if (!label || !icon) throw new Error("Category tile content missing");
        const background = getComputedStyle(tile).backgroundColor;
        return {
          name: tile.textContent?.trim(),
          label: contrast(getComputedStyle(label).color, background),
          icon: contrast(getComputedStyle(icon).color, background),
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
      const icon = tile.querySelector("svg");
      const iconRegion = icon?.parentElement;
      const labelRegion = tile.querySelector(":scope > span:last-child");
      const label = labelRegion?.querySelector("span");
      if (!icon || !iconRegion || !labelRegion || !label) {
        throw new Error("Category tile regions missing");
      }
      const iconVisualRect = icon.getBoundingClientRect();
      const iconRect = iconRegion.getBoundingClientRect();
      const labelRect = labelRegion.getBoundingClientRect();
      const gridStyle = getComputedStyle(element);
      return {
        width: tileRect.width,
        height: tileRect.height,
        iconVisualCenter:
          (iconVisualRect.top + iconVisualRect.height / 2 - tileRect.top) /
          tileRect.height,
        iconHeight: iconRect.height / tileRect.height,
        labelCenter:
          (labelRect.top + labelRect.height / 2 - tileRect.top) /
          tileRect.height,
        labelHeight: labelRect.height / tileRect.height,
        labelLineClamp: getComputedStyle(label).webkitLineClamp,
        labelOverflow: getComputedStyle(label).overflow,
        columns: gridStyle.gridTemplateColumns.split(" ").length,
        gap: gridStyle.columnGap,
        boxShadow: getComputedStyle(tile).boxShadow,
      };
    });
    expect(Math.abs(geometry.width - geometry.height)).toBeLessThan(1);
    expect(
      Math.abs(geometry.iconVisualCenter - (0.25 + 10 / geometry.height)),
    ).toBeLessThan(0.01);
    expect(Math.abs(geometry.labelCenter - 0.75)).toBeLessThan(0.01);
    expect(Math.abs(geometry.iconHeight - geometry.labelHeight)).toBeLessThan(
      0.001,
    );
    expect(geometry.labelLineClamp).toBe("2");
    expect(geometry.labelOverflow).toBe("hidden");
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
    expect(tabGeometry.controlHeight).toBeCloseTo(52, 3);
    expect(tabGeometry.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(tabGeometry.boxShadow).toBe("none");

    await expenseSlide.evaluate((element) => {
      const grid = element.querySelector<HTMLElement>(
        '[data-testid="category-grid"]',
      );
      if (!grid) throw new Error("Category grid missing");
      grid.style.minHeight = `${element.clientHeight + 160}px`;
    });
    const verticalScrollBefore = await expenseSlide.evaluate(
      (element) => element.scrollTop,
    );
    const horizontalScrollBefore = await viewport.evaluate(
      (element) => element.scrollLeft,
    );

    await touchSwipe(page, viewport, 3, -120);
    await expect
      .poll(() => expenseSlide.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(verticalScrollBefore);
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(
      horizontalScrollBefore,
    );
    await expenseSlide.evaluate((element) => {
      element.scrollTop = 0;
    });
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

  test("keeps a native quick-note drag alive outside the tile and applies the selected note", async ({
    page,
  }) => {
    await seedQuickNote(page);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Transaction type and categories" }),
    ).toHaveAttribute("data-quick-notes-ready", "true");
    const viewport = page.getByTestId("transaction-type-carousel");
    const tile = page.getByRole("button", { name: "Food Delivery" });
    const box = await tile.boundingBox();
    if (!box) throw new Error("Food Delivery tile missing");
    const client = await page.context().newCDPSession(page);
    const touchPoint = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint],
    });
    await page.waitForTimeout(450);

    const label = page.getByText("iOS Snap 73", { exact: true });
    await expect(label).toBeVisible();
    const targetBox = await label
      .locator("xpath=..")
      .locator("circle")
      .boundingBox();
    if (!targetBox) throw new Error("Quick-note radial target missing");
    const targetPoint = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    };
    const scrollLeftBeforeDrag = await viewport.evaluate(
      (element) => element.scrollLeft,
    );

    await tile.dispatchEvent("pointercancel", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
    });
    await expect(label).toBeVisible();

    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [targetPoint],
    });
    await page.waitForTimeout(50);

    await expect(label).toBeVisible();
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(
      scrollLeftBeforeDrag,
    );
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await client.detach();

    await expect(
      page.getByRole("dialog", { name: "Date & time" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByLabel("Transaction note")).toHaveValue(
      "iOS snap target selected",
    );
  });

  test("moves the type indicator during an active category swipe", async ({
    page,
  }) => {
    const viewport = page.getByTestId("transaction-type-carousel");
    const tile = page.getByRole("button", { name: "Food Delivery" });
    const indicator = page.getByTestId("animated-tabs-compact-indicator");
    const tileBox = await tile.boundingBox();
    const indicatorBefore = await indicator.boundingBox();
    if (!tileBox || !indicatorBefore) throw new Error("Carousel geometry missing");
    const client = await page.context().newCDPSession(page);
    const start = {
      x: tileBox.x + tileBox.width / 2,
      y: tileBox.y + tileBox.height / 2,
    };

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x - 180, y: start.y + 2 }],
    });
    await page.waitForTimeout(120);

    const indicatorDuring = await indicator.boundingBox();
    if (!indicatorDuring) throw new Error("Type indicator missing");
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
      0,
    );
    expect(indicatorDuring.x).toBeGreaterThan(indicatorBefore.x + 10);
    await expect(
      page.getByRole("button", { name: "Expense" }),
    ).toHaveAttribute("aria-pressed", "true");

    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await client.detach();
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

  test("keeps every category tile square at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const sizes = await page
      .getByLabel("Expense categories, slide 1 of 3")
      .getByTestId("category-grid")
      .getByRole("button")
      .evaluateAll((tiles) =>
        tiles.map((tile) => {
          const rect = tile.getBoundingClientRect();
          const label = tile.querySelector(":scope > span:last-child > span");
          const icon = tile.querySelector("svg");
          if (!label || !icon) throw new Error("Category content missing");
          const labelRect = label.getBoundingClientRect();
          const iconRect = icon.getBoundingClientRect();
          return {
            name: tile.textContent?.trim(),
            width: rect.width,
            height: rect.height,
            labelClientWidth: label.clientWidth,
            labelScrollWidth: label.scrollWidth,
            labelClientHeight: label.clientHeight,
            labelScrollHeight: label.scrollHeight,
            labelLineClamp: getComputedStyle(label).webkitLineClamp,
            labelLineHeight: Number.parseFloat(
              getComputedStyle(label).lineHeight,
            ),
            labelLeft: labelRect.left,
            labelRight: labelRect.right,
            labelTop: labelRect.top,
            labelBottom: labelRect.bottom,
            iconBottom: iconRect.bottom,
            tileLeft: rect.left,
            tileRight: rect.right,
            tileBottom: rect.bottom,
          };
        }),
      );

    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(
        Math.abs(size.width - size.height),
        `${size.name} measured ${size.width}×${size.height}`,
      ).toBeLessThan(1);
      expect(
        size.labelScrollWidth,
        `${size.name} label overflowed horizontally`,
      ).toBeLessThanOrEqual(size.labelClientWidth + 1);
      expect(size.labelLineClamp, `${size.name} label was not clamped`).toBe(
        "2",
      );
      expect(
        size.labelClientHeight,
        `${size.name} label exceeded two visible lines`,
      ).toBeLessThanOrEqual(size.labelLineHeight * 2 + 1);
      expect(size.labelTop, `${size.name} label overlapped its icon`).toBeGreaterThanOrEqual(
        size.iconBottom - 1,
      );
      expect(size.labelBottom, `${size.name} label escaped the tile bottom`).toBeLessThanOrEqual(
        size.tileBottom + 1,
      );
      expect(size.labelLeft, `${size.name} label escaped the tile left edge`).toBeGreaterThanOrEqual(
        size.tileLeft - 1,
      );
      expect(size.labelRight, `${size.name} label escaped the tile right edge`).toBeLessThanOrEqual(
        size.tileRight + 1,
      );
    }
  });

  test("reserves four category rows and gives remaining height to home activity", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const viewport = page.getByTestId("transaction-type-carousel");
    const expenseSlide = page.getByLabel(
      "Expense categories, slide 1 of 3",
    );
    const activity = page.getByRole("region", { name: "Home activity" });

    const categoryBox = await viewport.boundingBox();
    const activityBox = await activity.boundingBox();
    if (!categoryBox || !activityBox) {
      throw new Error("Dashboard layout missing");
    }

    const scrollStyle = await expenseSlide.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        scrollbarWidth: style.scrollbarWidth,
      };
    });

    expect(Math.abs(categoryBox.width - categoryBox.height)).toBeLessThan(1);
    expect(activityBox.height).toBeGreaterThan(250);
    expect(scrollStyle).toEqual({
      overflowY: "auto",
      scrollbarWidth: "none",
    });
  });

  test("keeps category labels and icons contrast-safe in both themes", async ({
    page,
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      const samples = await readCategoryContrast(page);

      for (const sample of samples) {
        expect(
          sample.label,
          `${sample.name} label contrast in ${colorScheme} mode`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          sample.icon,
          `${sample.name} icon contrast in ${colorScheme} mode`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
