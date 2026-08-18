import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryStepSheet } from "./CategoryStepSheet";

function rect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 390,
    height,
    top: 0,
    right: 390,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CategoryStepSheet accessibility", () => {
  it("keeps review controls exposed while the non-modal sheet is open", async () => {
    render(
      <CategoryStepSheet entry={<button type="button">Category entry</button>}>
        <button type="button">Interactive review</button>
      </CategoryStepSheet>,
    );

    const reviewControl = screen.getByText("Interactive review");
    await waitFor(() =>
      expect(document.querySelector("[data-vaul-drawer]")).toBeInTheDocument(),
    );

    expect(reviewControl.closest('[aria-hidden="true"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "Interactive review" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("dialog", { name: "Transaction entry" }),
    ).toHaveStyle({ height: "100dvh" });
  });

  it("measures a collapsed launcher mounted through the drawer portal", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "category-step-layout") return rect(700);
        if (this.dataset.testid === "category-step-launcher") return rect(108);
        return rect(0);
      },
    );

    render(
      <CategoryStepSheet
        entry={<button type="button">Category entry</button>}
        collapsedControls={<button type="button">Expense</button>}
      >
        <button type="button">Interactive review</button>
      </CategoryStepSheet>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Collapse transaction entry" }),
      ).toBeVisible(),
    );
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Collapse transaction entry" }),
      );

    await waitFor(() =>
      expect(screen.getByTestId("category-step-layout")).toHaveStyle({
        "--category-sheet-occlusion": "108px",
      }),
    );
  });
});
