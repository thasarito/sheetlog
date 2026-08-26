import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BankPickerScreen } from "./BankPickerScreen";
import { ImportedReceipt } from "./ImportedReceipt";

const receipt = {
  bootstrapId: "bootstrap-1",
  transaction: {
    id: "transaction-1",
    type: "expense" as const,
    amount: 120,
    currency: "THB" as const,
    account: "KBank",
    for: "Me",
    category: "Coffee & Snacks",
    date: "2026-08-26T10:00:00.000Z",
  },
};

describe("playful Tiny Win presentation", () => {
  it("matches the playful bank-picker hierarchy while keeping the real actions", () => {
    const onSignIn = vi.fn();
    render(
      <BankPickerScreen
        countryCode="TH"
        currency="THB"
        onCountryChange={vi.fn()}
        onCurrencyChange={vi.fn()}
        onSelectBank={vi.fn()}
        onSignIn={onSignIn}
      />,
    );

    expect(screen.getByTestId("tiny-win-mascot")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Which account is your everyday one?",
      }),
    ).toBeVisible();
    expect(screen.getByText(/Step 1 of 2 · Make it yours/i)).toBeVisible();
    expect(screen.getAllByTestId("featured-bank")).toHaveLength(8);
    expect(screen.getAllByTestId("featured-bank")[0]).toHaveAttribute(
      "data-playful-pressable",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /Thailand · THB/i }));
    expect(
      screen.getByRole("dialog", { name: "Country and currency" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Already use SheetLog? Sign in with Google",
      }),
    );
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("celebrates the imported transaction with a playful completion summary", () => {
    render(<ImportedReceipt receipt={receipt} onContinue={vi.fn()} />);

    expect(screen.getByTestId("tiny-win-success-art")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Nice. Your logging home is ready!",
      }),
    ).toBeVisible();
    expect(screen.getByText("KBank")).toBeVisible();
    expect(screen.getByText("THB")).toBeVisible();
    expect(screen.getByText("Coffee & Snacks")).toBeVisible();
  });

  it("uses offset layers instead of CSS shadows and respects reduced motion", () => {
    const css = readFileSync(new URL("./playful.css", import.meta.url), "utf8");

    expect(css).not.toMatch(/box-shadow/i);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".tiny-win-playful");
  });
});
