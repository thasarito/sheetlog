import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryStepSheet } from "./CategoryStepSheet";

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
});
