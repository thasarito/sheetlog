import { expect, type Locator, test } from "@playwright/test";

type RequiredBox = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function expectSameBox(actual: RequiredBox, expected: RequiredBox) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1);
}

test("StepAmount fills the stable portrait canvas without the title reel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("sheetlog.mock.transactions", "[]");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app");
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });

  const launcher = page
    .getByTestId("category-step-launcher")
    .getByRole("button");
  await expect(launcher).toBeVisible();
  if ((await launcher.getAttribute("aria-expanded")) !== "true") {
    await launcher.click();
  }

  const categoryGrid = page.getByTestId("category-grid");
  await expect(categoryGrid).toBeVisible();
  await categoryGrid.getByRole("button").first().click();
  await page.getByRole("button", { name: "Done" }).click();

  const canvas = page.getByTestId("transaction-canvas");
  const amountLayout = page.getByTestId("step-amount");
  await expect(amountLayout).toBeVisible();
  await expect(page.getByTestId("dashboard-header")).toBeHidden();

  const canvasBox = await canvas.boundingBox();
  const amountBox = await amountLayout.boundingBox();
  if (!canvasBox || !amountBox) {
    throw new Error("Expected transaction canvas and amount layout geometry");
  }
  expectSameBox(amountBox, canvasBox);

  const note = page.getByRole("combobox", { name: "Transaction note" });
  const keypad = page.getByRole("group", { name: "Amount keypad" });
  const submit = page.getByRole("button", { name: "Submit" });
  const beforeNote = await note.boundingBox();
  const beforeKeypad = await keypad.boundingBox();
  const beforeSubmit = await submit.boundingBox();
  if (!beforeNote || !beforeKeypad || !beforeSubmit) {
    throw new Error("Expected amount layout geometry before note entry");
  }

  await note.fill("Dinner note");

  const filledNote = await note.boundingBox();
  const filledKeypad = await keypad.boundingBox();
  const filledSubmit = await submit.boundingBox();
  if (!filledNote || !filledKeypad || !filledSubmit) {
    throw new Error("Expected amount layout geometry after note entry");
  }
  expectSameBox(filledNote, beforeNote);
  expectSameBox(filledKeypad, beforeKeypad);
  expectSameBox(filledSubmit, beforeSubmit);

  await page.setViewportSize({ width: 390, height: 544 });
  await page.waitForTimeout(32);

  const keyboardNote = await note.boundingBox();
  const keyboardKeypad = await keypad.boundingBox();
  const keyboardSubmit = await submit.boundingBox();
  const keyboardAmount = await amountLayout.boundingBox();
  if (!keyboardNote || !keyboardKeypad || !keyboardSubmit || !keyboardAmount) {
    throw new Error("Expected fixed amount layout with keyboard-sized viewport");
  }
  expectSameBox(keyboardNote, beforeNote);
  expectSameBox(keyboardKeypad, beforeKeypad);
  expectSameBox(keyboardSubmit, beforeSubmit);
  expectSameBox(keyboardAmount, amountBox);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
