import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StepCategoryTypeTabs } from "./StepCategoryTypeTabs";
import { useTransactionForm } from "./useTransactionForm";

describe("StepCategoryTypeTabs", () => {
  it("updates the shared form when a collapsed type tab is selected", async () => {
    const hook = renderHook(() =>
      useTransactionForm({
        initialValues: {
          type: "expense",
          category: "Food",
          note: "Central Cafe",
          place: { provider: "google", placeId: "central-cafe" },
        },
      }),
    );
    render(
      <StepCategoryTypeTabs
        form={hook.result.current}
        layoutId="collapsedTransactionType"
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Income" }));

    await waitFor(() =>
      expect(hook.result.current.state.values).toMatchObject({
        type: "income",
        category: "",
        note: "Central Cafe",
      }),
    );
    expect(hook.result.current.state.values.place).toBeUndefined();
    expect(screen.getByRole("button", { name: "Income" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
