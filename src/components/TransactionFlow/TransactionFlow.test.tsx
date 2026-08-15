import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionInput, TransactionRecord } from "../../lib/types";
import { TransactionFlow } from "./index";

const exactReimbursementDate = new Date("2026-08-14T07:08:09.000Z");

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  undoLast: vi.fn(),
  retrySummary: vi.fn(),
  nearbyCalls: [] as Array<{ enabled: boolean }>,
  expense: {
    id: "expense-1",
    type: "expense",
    amount: 100,
    currency: "THB",
    account: "Wallet",
    for: "Family",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    note: "Lunch",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    sheetRowValid: true,
  } as TransactionRecord,
  income: {
    id: "income-1",
    type: "income",
    amount: 100,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: "Salary",
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
  } as TransactionRecord,
  zeroExpense: {
    id: "expense-zero",
    type: "expense",
    amount: 0,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
  } as TransactionRecord,
  malformedExpense: {
    id: "expense-malformed",
    type: "expense",
    amount: 100,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    sheetRowValid: false,
  } as TransactionRecord,
  summaryState: {
    summary: {
      confirmed: 20,
      queued: 20,
      remaining: 60,
      overReimbursed: 0,
      currencyMismatchIds: [] as string[],
    },
    isChecking: false,
    isError: false,
    needsOnlineVerification: false,
  },
  addMutation: {
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
  updateMutation: {
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("../../app/providers", () => ({
  useConnectivity: () => ({ isOnline: true }),
  useWorkspace: () => ({ sheetId: "sheet-a" }),
  useTransactions: () => ({
    addTransaction: mocks.addTransaction,
    deleteTransaction: mocks.deleteTransaction,
    undoLast: mocks.undoLast,
    lastSyncError: null,
    lastSyncErrorAt: null,
  }),
}));

vi.mock("../../hooks/useOnboarding", () => ({
  useOnboarding: () => ({
    onboarding: {
      accounts: [{ name: "Wallet" }, { name: "Bank" }],
      categories: {
        expense: [{ name: "Food" }],
        income: [{ name: "Salary" }],
        transfer: [{ name: "Transfer" }],
      },
    },
    refreshOnboarding: vi.fn(async () => false),
  }),
}));

vi.mock("../../lib/googlePlaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/googlePlaces")>();
  return { ...actual, hasGoogleMapsApiKey: () => false };
});

vi.mock("../../lib/db", () => ({
  db: {
    transactions: {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    },
  },
}));

vi.mock("./useNearbyPlaceSuggestions", () => ({
  useNearbyPlaceSuggestions: (options: { enabled: boolean }) => {
    mocks.nearbyCalls.push(options);
    return {
      suggestions: [],
      coordinates: undefined,
      isLoading: false,
      canSearch: false,
    };
  },
}));

vi.mock("./usePlaceAutocomplete", () => ({
  usePlaceAutocomplete: () => ({
    input: "",
    setInput: vi.fn(),
    suggestions: [],
    isLoading: false,
    isError: false,
    error: null,
    selectionError: null,
    isSelecting: false,
    retry: vi.fn(),
    selectSuggestion: vi.fn(),
  }),
}));

vi.mock("./PlaceSearchDrawer", () => ({ PlaceSearchDrawer: () => null }));

vi.mock("./useReimbursementSummary", () => ({
  useReimbursementSummary: () => ({
    ...mocks.summaryState,
    retry: mocks.retrySummary,
  }),
}));

vi.mock("./useAddTransactionMutation", () => ({
  useAddTransactionMutation: () => mocks.addMutation,
}));

vi.mock("./useUpdateTransactionMutation", () => ({
  useUpdateTransactionMutation: () => mocks.updateMutation,
}));

vi.mock("../Header", () => ({ Header: () => <header>SheetLog</header> }));

vi.mock("./StepCard", () => ({
  StepCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./StepCategory", () => ({
  StepCategory: ({
    form,
    onConfirm,
  }: {
    form: { setFieldValue: (name: string, value: unknown) => void };
    onConfirm: () => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        form.setFieldValue("type", "expense");
        form.setFieldValue("category", "Food");
        onConfirm();
      }}
    >
      Start expense
    </button>
  ),
}));

vi.mock("./TopDashboard", () => ({
  TopDashboard: ({
    onEditTransaction,
  }: {
    onEditTransaction: (transaction: TransactionRecord) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onEditTransaction(mocks.expense)}>
        Edit expense
      </button>
      <button type="button" onClick={() => onEditTransaction(mocks.income)}>
        Edit income
      </button>
      <button
        type="button"
        onClick={() => onEditTransaction(mocks.zeroExpense)}
      >
        Edit zero expense
      </button>
      <button
        type="button"
        onClick={() => onEditTransaction(mocks.malformedExpense)}
      >
        Edit malformed expense
      </button>
    </div>
  ),
}));

vi.mock("../DateTimeDrawer", () => ({
  DateTimeDrawer: ({
    open,
    value,
    onChange,
  }: {
    open?: boolean;
    value: Date;
    onChange: (date: Date) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Date & time">
        <output aria-label="Drawer date">{value.toISOString()}</output>
        <button
          type="button"
          onClick={() => onChange(exactReimbursementDate)}
        >
          Set exact reimbursement date
        </button>
      </div>
    ) : null,
}));

vi.mock("../CategoryGridDrawer", () => ({ CategoryGridDrawer: () => null }));

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn() }),
);
vi.mock("sonner", () => ({ toast: toastMock }));

function createChild(
  input: TransactionInput,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    ...input,
    id: "child-exact",
    status: "synced",
    createdAt: "2026-08-15T10:30:00.000Z",
    updatedAt: "2026-08-15T10:30:00.000Z",
    ...overrides,
  };
}

function renderFlow() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionFlow />
    </QueryClientProvider>,
  );
}

async function openExpenseEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Edit expense" }));
  await screen.findByDisplayValue("Lunch");
}

async function enterReimbursement(user: ReturnType<typeof userEvent.setup>) {
  await openExpenseEditor(user);
  await user.click(screen.getByRole("button", { name: "Reimburse" }));
  await screen.findByText("Reimbursement");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  mocks.nearbyCalls.length = 0;
  mocks.addTransaction.mockReset();
  mocks.deleteTransaction.mockReset();
  mocks.undoLast.mockReset();
  mocks.retrySummary.mockReset();
  mocks.addMutation.mutateAsync.mockReset();
  mocks.addMutation.reset.mockReset();
  mocks.updateMutation.mutateAsync.mockReset();
  mocks.updateMutation.reset.mockReset();
  toastMock.mockClear();
  toastMock.error.mockClear();
  Object.assign(mocks.summaryState, {
    summary: {
      confirmed: 20,
      queued: 20,
      remaining: 60,
      overReimbursed: 0,
      currencyMismatchIds: [],
    },
    isChecking: false,
    isError: false,
    needsOnlineVerification: false,
  });
  mocks.addTransaction.mockImplementation(async (input: TransactionInput) =>
    createChild(input),
  );
  mocks.deleteTransaction.mockResolvedValue({ ok: true, message: "Removed" });
  mocks.undoLast.mockResolvedValue({ ok: true, message: "Undone" });
  mocks.addMutation.mutateAsync.mockResolvedValue(undefined);
  mocks.updateMutation.mutateAsync.mockResolvedValue(undefined);
});

describe("TransactionFlow reimbursement entry", () => {
  it("shows Reimburse only for parsed positive expenses in Delete, Reimburse, Save order", async () => {
    const user = userEvent.setup();
    renderFlow();

    await openExpenseEditor(user);
    const deleteButton = screen.getByRole("button", {
      name: "Delete transaction",
    });
    const reimburseButton = screen.getByRole("button", { name: "Reimburse" });
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(
      deleteButton.compareDocumentPosition(reimburseButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      reimburseButton.compareDocumentPosition(saveButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ["Edit income"],
    ["Edit zero expense"],
    ["Edit malformed expense"],
  ])("does not offer reimbursement for %s", async (buttonName) => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: buttonName }));

    expect(
      screen.queryByRole("button", { name: "Reimburse" }),
    ).not.toBeInTheDocument();
  });

  it("uses a separate reimbursement form and Back restores the exact source edits", async () => {
    const user = userEvent.setup();
    renderFlow();
    await openExpenseEditor(user);
    const sourceNote = screen.getByPlaceholderText("Add a note...");
    await user.clear(sourceNote);
    await user.type(sourceNote, "Unsaved source edit");
    await user.click(screen.getByRole("button", { name: "2" }));

    await user.click(screen.getByRole("button", { name: "Reimburse" }));

    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Lunch");
    expect(screen.getByRole("button", { name: "THB" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Family" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wallet" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "2" })).toBeEnabled();

    await user.clear(screen.getByPlaceholderText("Add a note..."));
    await user.type(
      screen.getByPlaceholderText("Add a note..."),
      "Repayment edit",
    );
    await user.click(screen.getByRole("button", { name: "Go back" }));

    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("1002")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue(
      "Unsaved source edit",
    );
  });

  it("never enables Places in reimbursement mode", async () => {
    const user = userEvent.setup();
    renderFlow();

    await enterReimbursement(user);

    expect(mocks.nearbyCalls.at(-1)).toMatchObject({ enabled: false });
    expect(
      screen.queryByRole("button", { name: "Search places" }),
    ).not.toBeInTheDocument();
  });

  it("keeps reimbursement account changes out of create-form preferences", async () => {
    window.localStorage.setItem("sheetlog.lastCurrency_Bank", "USD");
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);
    expect(window.localStorage.getItem("sheetlog.lastAccount")).toBe("Wallet");

    await user.click(screen.getByRole("button", { name: "Bank" }));

    expect(screen.getByRole("button", { name: "THB" })).toBeDisabled();
    expect(window.localStorage.getItem("sheetlog.lastAccount")).toBe("Wallet");
    expect(window.localStorage.getItem("sheetlog.lastCurrency_Bank")).toBe(
      "USD",
    );
  });

  it.each([
    [
      "checking",
      { isChecking: true },
      "Checking reimbursements...",
      "Reimburse",
    ],
    [
      "remote error",
      { isError: true },
      "Unable to check reimbursements.",
      "Reimburse",
    ],
    [
      "currency mismatch",
      { summary: { currencyMismatchIds: ["child-bad"] } },
      "Currency mismatch in linked reimbursements",
      "Reimburse",
    ],
    [
      "overage",
      { summary: { remaining: 0, overReimbursed: 10 } },
      "Over-reimbursed by THB 10",
      "Reimburse",
    ],
    [
      "full",
      { summary: { confirmed: 80, queued: 20, remaining: 0 } },
      "Fully reimbursed",
      "Fully reimbursed",
    ],
  ])(
    "disables reimbursement entry while the balance is %s",
    async (_label, state, message, buttonName) => {
      if ("summary" in state) {
        Object.assign(mocks.summaryState.summary, state.summary);
      }
      Object.assign(mocks.summaryState, {
        ...(!("isChecking" in state)
          ? {}
          : { isChecking: state.isChecking }),
        ...(!("isError" in state) ? {} : { isError: state.isError }),
      });
      const user = userEvent.setup();
      renderFlow();

      await openExpenseEditor(user);

      expect(screen.getAllByText(message).length).toBeGreaterThan(0);
      expect(
        screen.getByRole("button", { name: buttonName }),
      ).toBeDisabled();
    },
  );
});

describe("TransactionFlow reimbursement submission and receipt", () => {
  it("retains the ordinary transaction two-second receipt transition", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mocks.addMutation.mutateAsync).toHaveBeenCalledTimes(1);
      expect(
        timeoutSpy.mock.calls.some((call) => call[1] === 2000),
      ).toBe(true);
    });
  });

  it("submits only once, keeps the receipt persistent, and Done returns to the dashboard", async () => {
    const request = deferred<TransactionRecord>();
    mocks.addTransaction.mockReturnValue(request.promise);
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);

    const submit = screen.getByRole("button", { name: "Submit" });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    expect(mocks.addTransaction).toHaveBeenCalledTimes(1);

    const submittedInput = mocks.addTransaction.mock.calls[0]?.[0];
    await act(async () => {
      request.resolve(createChild(submittedInput));
      await request.promise;
    });

    expect(
      await screen.findByText("Reimbursement recorded"),
    ).toBeInTheDocument();
    expect(screen.getByText("Saved to Google Sheets.")).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-timed-progress")).not.toBeInTheDocument();
    expect(
      timeoutSpy.mock.calls.some((call) => call[1] === 2000),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Edit expense" })).toBeVisible();
  });

  it("uses queued receipt copy for an offline-pending child", async () => {
    mocks.addTransaction.mockImplementation(async (input: TransactionInput) =>
      createChild(input, { status: "pending" }),
    );
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Reimbursement queued")).toBeInTheDocument();
    expect(
      screen.getByText("Saved locally and will sync to Google Sheets."),
    ).toBeInTheDocument();
  });

  it("binds the reimbursement date drawer to the separate form", async () => {
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);

    const dateButton = screen
      .getAllByRole("button")
      .find((button) => /\d{2} \w{3} · \d{2}:\d{2}/.test(button.textContent ?? ""));
    expect(dateButton).toBeDefined();
    await user.click(dateButton as HTMLButtonElement);
    await user.click(
      screen.getByRole("button", { name: "Set exact reimbursement date" }),
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalledTimes(1));
    expect(mocks.addTransaction.mock.calls[0]?.[0]).toMatchObject({
      date: "2026-08-14T07:08:09",
    });
  });

  it("undoes the exact returned child instead of the latest unrelated transaction", async () => {
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Reimbursement recorded");

    await user.click(
      screen.getByRole("button", { name: "Undo reimbursement" }),
    );

    await waitFor(() => {
      expect(mocks.deleteTransaction).toHaveBeenCalledWith("child-exact");
    });
    expect(mocks.undoLast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit expense" })).toBeVisible();
  });

  it("keeps the amount form open and shows no receipt when provider validation returns an error row", async () => {
    mocks.addTransaction.mockImplementation(async (input: TransactionInput) =>
      createChild(input, {
        status: "error",
        error: "Amount exceeds remaining reimbursement balance",
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Amount exceeds remaining reimbursement balance",
      );
    });
    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    expect(
      screen.queryByText("Reimbursement failed"),
    ).not.toBeInTheDocument();
  });
});
