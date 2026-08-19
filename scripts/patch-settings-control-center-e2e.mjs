import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/home-carousel.spec.ts';
const source = readFileSync(path, 'utf8');
const startMarker = '  test("keeps Settings inline, mounted, scroll-linked, and free of modal chrome"';
const endMarker = '\n\n  test("keeps the Transactions dock tied to slide 2 and preserves its search state"';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error('Could not locate the existing Settings carousel scenario');
}

const replacement = String.raw`  test("keeps Settings as an expandable Control Center with nested editors", async ({
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
    const categorySheet = page.getByRole("dialog", {
      name: "Transaction entry",
    });
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

    await settings.getByRole("button", { name: /^Accounts/ }).click();
    await settings.getByRole("button", { name: /^Categories/ }).click();

    const accountsRegion = settings.getByRole("region", { name: "Accounts" });
    const categoriesRegion = settings.getByRole("region", {
      name: "Categories",
    });
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
    await expect(page.getByRole("dialog")).toHaveCount(2);

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

    await settings.getByRole("button", { name: /^Data & sync/ }).click();
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
  });`;

writeFileSync(path, `${source.slice(0, start)}${replacement}${source.slice(end)}`);
