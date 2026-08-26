import { expect, test } from "@playwright/test";

test.use({ locale: "th-TH", timezoneId: "Asia/Bangkok" });

test.describe("Application entry", () => {
  test("opens Tiny Win directly from the root URL", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "What do you usually pay with?" }),
    ).toBeVisible();
    await expect(page.getByTestId("featured-bank")).toHaveCount(8);
    await expect(page.getByRole("button", { name: /KBank/ })).toBeVisible();
    await expect(page.getByText("No sign-in needed")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Let's get started" }),
    ).not.toBeVisible();
  });

  test("keeps the legacy app URL on the same Tiny Win entry", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(
      page.getByRole("heading", { name: "What do you usually pay with?" }),
    ).toBeVisible();
    await expect(page.getByTestId("featured-bank")).toHaveCount(8);
  });
});
