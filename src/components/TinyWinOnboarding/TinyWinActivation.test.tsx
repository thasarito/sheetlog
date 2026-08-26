import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TinyWinActivation } from "./TinyWinActivation";

const mocks = vi.hoisted(() => ({
  updateOnboarding: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../app/providers", () => ({
  useSession: () => ({
    connect: mocks.connect,
    isConnecting: false,
  }),
}));

vi.mock("../../hooks/useOnboarding", () => ({
  useOnboarding: () => ({ updateOnboarding: mocks.updateOnboarding }),
}));

vi.mock("../TransactionFlow", () => ({
  TransactionFlow: () => <div>Real transaction flow</div>,
}));

vi.mock("./BootstrapTransactionsProvider", () => ({
  BootstrapTransactionsProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
}));

describe("TinyWinActivation", () => {
  beforeEach(() => {
    mocks.connect.mockClear();
    mocks.updateOnboarding.mockClear();
  });

  it("shows eight local banks and enters the real flow with one bank tap", async () => {
    render(
      <TinyWinActivation
        initialCountryCode="TH"
        initialCurrency="THB"
        onToast={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("featured-bank")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /KBank/ }));
    await waitFor(() =>
      expect(screen.getByText("Real transaction flow")).toBeInTheDocument(),
    );
    expect(mocks.updateOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: [expect.objectContaining({ name: "KBank" })],
        accountsConfirmed: true,
        categoriesConfirmed: true,
        analyticsBaseCurrency: "THB",
      }),
    );
  });

  it("keeps currency editable independently from the selected country", () => {
    render(
      <TinyWinActivation
        initialCountryCode="TH"
        initialCurrency="USD"
        onToast={vi.fn()}
      />,
    );
    expect(screen.getByText("Thailand · USD")).toBeInTheDocument();
  });

  it("finds a bank by localized alias", () => {
    render(
      <TinyWinActivation
        initialCountryCode="TH"
        initialCurrency="THB"
        onToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Other bank/ }));
    fireEvent.change(screen.getByPlaceholderText("Search every bank"), {
      target: { value: "กสิกร" },
    });
    expect(
      screen.getByRole("button", { name: /KBank.*Thailand/ }),
    ).toBeVisible();
  });

  it("lets a returning user sign in without making Google the primary action", async () => {
    render(
      <TinyWinActivation
        initialCountryCode="TH"
        initialCurrency="THB"
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Already use SheetLog? Sign in with Google",
      }),
    );

    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
    expect(screen.getAllByTestId("featured-bank")).toHaveLength(8);
  });
});
