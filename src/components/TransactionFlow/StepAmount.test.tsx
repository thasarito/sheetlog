import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import { StepAmount } from "./StepAmount";
import { useTransactionForm } from "./useTransactionForm";

const starbucks = {
  placeId: "starbucks-asok",
  name: "Starbucks",
} satisfies PlaceSuggestion;

const terminal21 = {
  placeId: "terminal-21",
  name: "Terminal 21",
  secondaryText: "Asok",
} satisfies PlaceSuggestion;

function StepAmountHarness({
  suggestions = [],
  isLoading = false,
  canSearch = false,
  initialNote = "",
  onSubmit = vi.fn(),
  onNearbyPlaceSelect = vi.fn(),
  onSearchPlaces = vi.fn(),
  searchButtonRef,
  noteInputRef,
  accounts = ["Wallet"],
  initialAmount = "125",
  initialCurrency = "THB",
  initialAccount = "Wallet",
  initialFor = "Me",
  currencyLocked = false,
  forLocked = false,
  amountLocked = false,
  preserveCurrencyOnAccountChange = false,
  middleAction,
  onDelete,
  submitLabel,
  customHeader,
  optionalAmount = false,
}: {
  suggestions?: PlaceSuggestion[];
  isLoading?: boolean;
  canSearch?: boolean;
  initialNote?: string;
  onSubmit?: () => void;
  onNearbyPlaceSelect?: (suggestion: PlaceSuggestion) => void;
  onSearchPlaces?: () => void;
  searchButtonRef?: React.Ref<HTMLButtonElement>;
  noteInputRef?: React.Ref<HTMLInputElement>;
  accounts?: string[];
  initialAmount?: string;
  initialCurrency?: string;
  initialAccount?: string;
  initialFor?: string;
  currencyLocked?: boolean;
  forLocked?: boolean;
  amountLocked?: boolean;
  preserveCurrencyOnAccountChange?: boolean;
  middleAction?: React.ReactNode;
  onDelete?: () => void;
  submitLabel?: string;
  customHeader?: React.ReactNode;
  optionalAmount?: boolean;
}) {
  const form = useTransactionForm({
    initialValues: {
      category: "Coffee",
      amount: initialAmount,
      currency: initialCurrency,
      account: initialAccount,
      forValue: initialFor,
      note: initialNote,
    },
  });
  const values = form.useStore((state) => state.values);

  return (
    <>
      <output aria-label="Current amount">{values.amount}</output>
      <output aria-label="Current currency">{values.currency}</output>
      <output aria-label="Current account">{values.account}</output>
      <output aria-label="Current For">{values.forValue}</output>
      <StepAmount
        form={form}
        accounts={accounts}
        onBack={vi.fn()}
        onSubmit={onSubmit}
        onDelete={onDelete}
        submitLabel={submitLabel}
        customHeader={customHeader}
        optionalAmount={optionalAmount}
        nearbyPlaceSuggestions={suggestions}
        isNearbyPlacesLoading={isLoading}
        canSearchPlaces={canSearch}
        onNearbyPlaceSelect={(suggestion) => {
          onNearbyPlaceSelect(suggestion);
          form.setFieldValue("note", suggestion.name);
        }}
        onSearchPlaces={onSearchPlaces}
        searchButtonRef={searchButtonRef}
        noteInputRef={noteInputRef}
        currencyLocked={currencyLocked}
        forLocked={forLocked}
        amountLocked={amountLocked}
        preserveCurrencyOnAccountChange={preserveCurrencyOnAccountChange}
        middleAction={middleAction}
      />
    </>
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("StepAmount nearby place suggestions", () => {
  it("replaces an empty note when a structured place is selected", async () => {
    const user = userEvent.setup();
    const onNearbyPlaceSelect = vi.fn();
    render(
      <StepAmountHarness
        suggestions={[starbucks]}
        onNearbyPlaceSelect={onNearbyPlaceSelect}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use Starbucks as note" })
    );

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue(
      "Starbucks"
    );
    expect(onNearbyPlaceSelect).toHaveBeenCalledWith(starbucks);
  });

  it("replaces an existing note when a place is selected", async () => {
    const user = userEvent.setup();
    render(
      <StepAmountHarness
        suggestions={[terminal21]}
        initialNote="Lunch"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use Terminal 21 as note" })
    );

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue(
      "Terminal 21"
    );
  });

  it("opens place search even when there are no nearby suggestions", async () => {
    const user = userEvent.setup();
    const onSearchPlaces = vi.fn();
    render(
      <StepAmountHarness
        canSearch
        onSearchPlaces={onSearchPlaces}
      />
    );

    await user.click(screen.getByRole("button", { name: "Search places" }));

    expect(onSearchPlaces).toHaveBeenCalledTimes(1);
  });

  it("exposes the Search button ref for focus restoration", () => {
    const searchButtonRef = createRef<HTMLButtonElement>();
    render(
      <StepAmountHarness canSearch searchButtonRef={searchButtonRef} />
    );

    expect(searchButtonRef.current).toBe(
      screen.getByRole("button", { name: "Search places" })
    );
  });

  it("exposes the note input ref as a focus fallback", () => {
    const noteInputRef = createRef<HTMLInputElement>();
    render(<StepAmountHarness noteInputRef={noteInputRef} />);

    expect(noteInputRef.current).toBe(
      screen.getByPlaceholderText("Add a note...")
    );
  });

  it("does not disable submit while suggestions are loading", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<StepAmountHarness isLoading onSubmit={onSubmit} />);

    const submitButton = screen.getByRole("button", { name: /submit/i });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("StepAmount reimbursement control locks", () => {
  it("uses native disabled semantics for locked currency, For, and amount controls", () => {
    render(
      <StepAmountHarness currencyLocked forLocked amountLocked />
    );

    expect(screen.getByRole("button", { name: "USD" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Work" })).toBeDisabled();

    const keypad = screen.getByRole("group", { name: "Amount keypad" });
    for (const key of Array.from(keypad.querySelectorAll("button"))) {
      expect(key).toBeDisabled();
    }
  });

  it("keeps account editable and preserves currency when changing reimbursement account", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    window.localStorage.setItem("sheetlog.lastCurrency_Bank", "USD");
    window.localStorage.setItem("sheetlog.lastCurrency", "EUR");
    render(
      <StepAmountHarness
        accounts={["Wallet", "Bank"]}
        currencyLocked
        forLocked
        preserveCurrencyOnAccountChange
        onSubmit={onSubmit}
      />
    );

    const bankOption = screen.getByRole("button", { name: "Bank" });
    expect(bankOption).toBeEnabled();
    await user.click(bankOption);

    expect(screen.getByLabelText("Current account")).toHaveTextContent("Bank");
    expect(screen.getByLabelText("Current currency")).toHaveTextContent("THB");

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("renders the middle action in Delete, middle, Save order", () => {
    render(
      <StepAmountHarness
        onDelete={vi.fn()}
        submitLabel="Save"
        middleAction={<button type="button">Reimburse</button>}
      />
    );

    const deleteButton = screen.getByRole("button", {
      name: "Delete transaction",
    });
    const middleButton = screen.getByRole("button", { name: "Reimburse" });
    const saveButton = screen.getByRole("button", { name: "Save" });

    expect(
      deleteButton.compareDocumentPosition(middleButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      middleButton.compareDocumentPosition(saveButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe("StepAmount existing caller defaults", () => {
  it("keeps create controls editable and restores per-account currency by default", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("sheetlog.lastCurrency_Bank", "USD");
    render(<StepAmountHarness accounts={["Wallet", "Bank"]} />);

    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Bank" }));

    expect(screen.getByLabelText("Current For")).toHaveTextContent("Work");
    expect(screen.getByLabelText("Current amount")).toHaveTextContent("1252");
    expect(screen.getByLabelText("Current currency")).toHaveTextContent("USD");
  });

  it("keeps edit Delete and Save actions active by default", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onSubmit = vi.fn();
    render(
      <StepAmountHarness
        onDelete={onDelete}
        onSubmit={onSubmit}
        submitLabel="Save"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Delete transaction" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps Quick Note optional-amount keyboard submission active by default", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <StepAmountHarness
        initialAmount=""
        optionalAmount
        customHeader={<h2>Quick Note</h2>}
        submitLabel="Save Quick Note"
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByPlaceholderText("Add a note..."), "Taxi{enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
