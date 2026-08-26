import { expect, test } from "@playwright/test";

test.use({ locale: "th-TH", timezoneId: "Asia/Bangkok" });

test.describe("Application entry", () => {
  test("opens playful Tiny Win directly from the root URL", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Which account is your everyday one?",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("tiny-win-mascot")).toBeVisible();
    await expect(page.getByTestId("featured-bank")).toHaveCount(8);
    await expect(page.getByRole("button", { name: /KBank/ })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Already use SheetLog? Sign in with Google",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Let's get started" }),
    ).not.toBeVisible();
  });

  test("keeps the legacy app URL on the same playful Tiny Win entry", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(
      page.getByRole("heading", {
        name: "Which account is your everyday one?",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("featured-bank")).toHaveCount(8);
  });
});
