import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepAmount } from "./StepAmount";
import { useTransactionForm } from "./useTransactionForm";

function Harness() {
  const form = useTransactionForm({
    initialValues: {
      type: "expense",
      category: "Coffee",
      amount: "125",
      currency: "THB",
      account: "Wallet",
      forValue: "Me",
      note: "",
    },
  });

  return (
    <StepAmount
      form={form}
      accounts={["Wallet"]}
      onBack={vi.fn()}
      onSubmit={vi.fn()}
      places={{
        enabled: true,
        nearbySuggestions: [],
        isNearbyLoading: false,
      }}
    />
  );
}

describe("StepAmount backdrop veil stage", () => {
  it("keeps the header and active note outside a dedicated result stage", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    const stage = screen.getByTestId("place-search-stage");
    const target = screen.getByTestId("place-search-overlay-target");
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    expect(stage).toContainElement(target);
    expect(stage).not.toContainElement(input);
    expect(target).toHaveClass(
      "pointer-events-none",
      "absolute",
      "inset-0",
      "z-10",
    );
    expect(input.closest("[data-step-amount-search-canvas]")).not.toBeNull();
  });
});
