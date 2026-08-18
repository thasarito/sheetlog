import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionInput, TransactionRecord } from "../../lib/types";
import { TransactionFlow } from "./index";
import type { TransactionFormApi } from "./useTransactionForm";
import { UpdateTransactionRecordError } from "./useUpdateTransactionMutation";

const exactReimbursementDate = new Date("2026-08-14T07:08:09.000Z");

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  undoLast: vi.fn(),
  retrySummary: vi.fn(),
  nearbyCalls: [] as Array<{ enabled: boolean }>,
  summaryCalls: [] as Array<{
    source: TransactionRecord | null;
    excludeChildId?: string;
  }>,
  sourceQueryCalls: [] as Array<string | null | undefined>,
  sourceQueryState: {
    data: undefined as TransactionRecord | null | undefined,
    isChecking: false,
    isLoading: false,
    isError: false,
    error: null as Error | null,
  },
  retrySource: vi.fn(),
  forms: [] as TransactionFormApi[],
  dbGet: vi.fn(),
  dbPut: vi.fn(),
  dashboardEdit: null as ((transaction: TransactionRecord) => void) | null,
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
  expenseB: {
    id: "expense-2",
    type: "expense",
    amount: 55,
    currency: "USD",
    account: "Bank",
    for: "Me",
    category: "Food",
    date: "2026-08-14T12:00:00.000Z",
    note: "Dinner",
    status: "synced",
    createdAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T12:00:00.000Z",
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
  linkedChild: {
    id: "linked-child",
    type: "income",
    amount: 30,
    currency: "THB",
    account: "Bank",
    for: "Family",
    category: "Reimbursement",
    date: "2026-08-15T09:00:00.000Z",
    note: "Lunch repayment",
    reimbursesTransactionId: "expense-1",
    status: "synced",
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    sheetRowValid: true,
  } as TransactionRecord,
  failedLinkedChild: {
    id: "failed-linked-child",
    type: "income",
    amount: 30,
    currency: "THB",
    account: "Bank",
    for: "Family",
    category: "Reimbursement",
    date: "2026-08-15T09:00:00.000Z",
    note: "Lunch repayment",
    reimbursesTransactionId: "expense-1",
    status: "error",
    error: "Original expense temporarily unavailable",
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    sheetRowValid: true,
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

vi.mock("./useTransactionForm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useTransactionForm")>();
  return {
    ...actual,
    useTransactionForm: (
      options?: Parameters<typeof actual.useTransactionForm>[0],
    ) => {
      const form = actual.useTransactionForm(options);
      if (!mocks.forms.includes(form)) {
        mocks.forms.push(form);
      }
      return form;
    },
  };
});

vi.mock("../../app/providers", () => ({
  useConnectivity: () => ({ isOnline: true }),
  useSession: () => ({
    userProfile: { id: "user-a", name: "Test user", picture: null },
  }),
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
      sheetFolderId: null,
      accounts: [{ name: "Wallet" }, { name: "Bank" }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: "Food" }],
        income: [{ name: "Salary" }],
        transfer: [{ name: "Transfer" }],
      },
      categoriesConfirmed: true,
      analyticsBaseCurrency: "THB",
      analyticsBaseCurrencyUpdatedAt: null,
      analyticsBigSpendingThreshold: null,
    },
  }),
}));

vi.mock("../../lib/googlePlaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/googlePlaces")>();
  return { ...actual, hasGoogleMapsApiKey: () => false };
});

vi.mock("../../lib/db", () => ({
  db: {
    transactions: {
      get: mocks.dbGet,
      put: mocks.dbPut,
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
    suggestions: [],
    isDebouncing: false,
    isLoading: false,
    isError: false,
    error: null,
    sessionError: null,
    hasSearched: false,
    selectionError: null,
    isSelecting: false,
    selectSuggestion: vi.fn(),
  }),
}));

vi.mock("./useReimbursementSummary", () => ({
  useReimbursementSummary: (options: {
    source: TransactionRecord | null;
    excludeChildId?: string;
  }) => {
    mocks.summaryCalls.push(options);
    return {
      ...mocks.summaryState,
      retry: mocks.retrySummary,
    };
  },
}));

vi.mock("./useTransactionByIdQuery", () => ({
  useTransactionByIdQuery: (id: string | null | undefined) => {
    mocks.sourceQueryCalls.push(id);
    return {
      ...mocks.sourceQueryState,
      refetch: mocks.retrySource,
    };
  },
}));

vi.mock("./useAddTransactionMutation", () => ({
  useAddTransactionMutation: () => mocks.addMutation,
}));

vi.mock("./useUpdateTransactionMutation", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./useUpdateTransactionMutation")
  >();
  return {
    ...actual,
    useUpdateTransactionMutation: () => mocks.updateMutation,
  };
});

vi.mock("../Header", () => ({ Header: () => <header>SheetLog</header> }));

vi.mock("./StepCard", () => ({
  StepCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./StepCategory", () => ({
  StepCategory: ({
    form,
    onConfirm,
    dateDrawerNested,
  }: {
    form: { setFieldValue: (name: string, value: unknown) => void };
    onConfirm: () => void;
    dateDrawerNested?: boolean;
  }) => (
    <button
      type="button"
      data-date-drawer-nested={String(dateDrawerNested)}
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

vi.mock("./HomeDashboardCarousel", () => ({
  HomeDashboardCarousel: ({
    onEditTransaction,
  }: {
    onEditTransaction: (transaction: TransactionRecord) => void;
  }) => {
    mocks.dashboardEdit = onEditTransaction;
    return (
      <section aria-label="Home activity">
        <button
          type="button"
          onClick={() => onEditTransaction(mocks.expense)}
        >
          Edit expense from full review
        </button>
        <button
          type="button"
          onClick={() => onEditTransaction(mocks.expense)}
        >
          Edit expense
        </button>
        <button
          type="button"
          onClick={() => onEditTransaction(mocks.expenseB)}
        >
          Edit expense B
        </button>
        <button
          type="button"
          onClick={() => onEditTransaction(mocks.income)}
        >
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
        <button
          type="button"
          onClick={() => onEditTransaction(mocks.linkedChild)}
        >
          Edit linked reimbursement
        </button>
        <button
          type="button"
          onClick={() => onEditTransaction(mocks.failedLinkedChild)}
        >
          Edit failed reimbursement
        </button>
        <button
          type="button"
          onClick={() =>
            onEditTransaction({
              ...mocks.expense,
              place: { provider: "google", placeId: "history-place" },
              cachedAt: "2026-08-15T10:00:00.000Z",
              canEdit: true,
              searchText: "food lunch wallet",
            } as TransactionRecord)
          }
        >
          Edit history expense
        </button>
      </section>
    );
  },
}));

vi.mock("./CategoryStepSheet", () => ({
  CategoryStepSheet: ({
    children,
    entry,
  }: {
    children: React.ReactNode;
    entry: React.ReactNode;
  }) =>
    (
      <div data-testid="category-step-layout">
        {children}
        <aside>{entry}</aside>
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

async function openLinkedEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Edit linked reimbursement" }),
  );
  await screen.findByDisplayValue("Lunch repayment");
}

async function openFailedLinkedEditor(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: "Edit failed reimbursement" }),
  );
  await screen.findByDisplayValue("Lunch repayment");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  mocks.nearbyCalls.length = 0;
  mocks.summaryCalls.length = 0;
  mocks.sourceQueryCalls.length = 0;
  mocks.forms.length = 0;
  mocks.dbGet.mockReset();
  mocks.dbPut.mockReset();
  mocks.dashboardEdit = null;
  mocks.addTransaction.mockReset();
  mocks.deleteTransaction.mockReset();
  mocks.undoLast.mockReset();
  mocks.retrySummary.mockReset();
  mocks.retrySource.mockReset();
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
  Object.assign(mocks.sourceQueryState, {
    data: mocks.expense,
    isChecking: false,
    isLoading: false,
    isError: false,
    error: null,
  });
  mocks.addTransaction.mockImplementation(async (input: TransactionInput) =>
    createChild(input),
  );
  mocks.dbGet.mockResolvedValue(undefined);
  mocks.dbPut.mockResolvedValue(undefined);
  mocks.deleteTransaction.mockResolvedValue({
    ok: true,
    outcome: "deleted",
    message: "Removed",
  });
  mocks.undoLast.mockResolvedValue({
    ok: true,
    outcome: "deleted",
    message: "Undone",
  });
  mocks.addMutation.mutateAsync.mockResolvedValue(undefined);
  mocks.updateMutation.mutateAsync.mockResolvedValue(undefined);
});

describe("TransactionFlow reimbursement entry", () => {
  it("layers the default category entry above the full review carousel", () => {
    renderFlow();

    const transactionCanvas = screen.getByTestId("transaction-canvas");
    expect(transactionCanvas).toHaveStyle({
      height: `${window.innerHeight}px`,
    });
    expect(transactionCanvas).toHaveClass("shrink-0");
    expect(transactionCanvas).not.toHaveClass("h-dvh");

    const layout = screen.getByTestId("category-step-layout");
    expect(
      within(layout).getByRole("region", { name: "Home activity" }),
    ).toBeVisible();
    expect(
      within(layout).getByRole("button", { name: "Start expense" }),
    ).toHaveAttribute("data-date-drawer-nested", "true");
  });

  it("routes a full-review row into the existing editor", async () => {
    renderFlow();

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Edit expense from full review" }),
    );

    expect(await screen.findByDisplayValue("Lunch")).toBeInTheDocument();
  });

  it("routes a complete-history row directly into the existing editor", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Edit history expense" }),
    );

    expect(await screen.findByDisplayValue("Lunch")).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.dbPut).toHaveBeenCalledWith({
        ...mocks.expense,
        place: { provider: "google", placeId: "history-place" },
        targetSheetId: "sheet-a",
        targetUserId: "user-a",
      });
    });
  });

  it("ignores late editor hydration when a newer transaction was selected", async () => {
    const expenseARead = deferred<TransactionRecord | undefined>();
    const expenseBRead = deferred<TransactionRecord | undefined>();
    mocks.dbGet.mockImplementation((id: string) =>
      id === mocks.expense.id ? expenseARead.promise : expenseBRead.promise,
    );
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    await user.click(screen.getByRole("button", { name: "Edit expense B" }));
    await act(async () => {
      expenseBRead.resolve(undefined);
      await expenseBRead.promise;
    });
    expect(await screen.findByDisplayValue("Dinner")).toBeInTheDocument();

    await act(async () => {
      expenseARead.resolve(undefined);
      await expenseARead.promise;
    });
    expect(screen.getByDisplayValue("Dinner")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Lunch")).not.toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
  });

  it("ignores late editor hydration after starting a new create flow", async () => {
    const expenseRead = deferred<TransactionRecord | undefined>();
    mocks.dbGet.mockReturnValue(expenseRead.promise);
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("");

    await act(async () => {
      expenseRead.resolve(undefined);
      await expenseRead.promise;
    });
    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("");
    expect(screen.queryByDisplayValue("Lunch")).not.toBeInTheDocument();
  });

  it("stamps a remote dashboard row with the current immutable local scope before editing", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));

    await waitFor(() => {
      expect(mocks.dbPut).toHaveBeenCalledWith({
        ...mocks.expense,
        targetSheetId: "sheet-a",
        targetUserId: "user-a",
      });
    });
  });

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

  it("clears an armed delete confirmation across a reimbursement round trip", async () => {
    const user = userEvent.setup();
    renderFlow();
    await openExpenseEditor(user);

    await user.click(
      screen.getByRole("button", { name: "Delete transaction" }),
    );
    expect(mocks.deleteTransaction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reimburse" }));
    await user.click(screen.getByRole("button", { name: "Go back" }));

    await user.click(
      screen.getByRole("button", { name: "Delete transaction" }),
    );
    expect(mocks.deleteTransaction).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Delete transaction" }),
    );

    await waitFor(() => {
      expect(mocks.deleteTransaction).toHaveBeenCalledWith("expense-1");
    });
  });

  it("blocks reimbursement while source deletion is in flight", async () => {
    const deletion = deferred<{
      ok: boolean;
      outcome: "deleted";
      message: string;
    }>();
    mocks.deleteTransaction.mockReturnValue(deletion.promise);
    const user = userEvent.setup();
    renderFlow();
    await openExpenseEditor(user);

    const deleteButton = screen.getByRole("button", {
      name: "Delete transaction",
    });
    const reimburse = screen.getByRole("button", { name: "Reimburse" });
    await user.click(deleteButton);
    act(() => {
      deleteButton.click();
      reimburse.click();
    });
    await waitFor(() => {
      expect(mocks.deleteTransaction).toHaveBeenCalledWith("expense-1");
    });

    expect(reimburse).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
    expect(screen.queryByText("Reimbursement")).not.toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();

    await act(async () => {
      deletion.resolve({
        ok: true,
        outcome: "deleted",
        message: "Removed synced entry",
      });
      await deletion.promise;
    });
  });

  it("blocks same-tick Back and Save after a confirmed source deletion starts", async () => {
    const deletion = deferred<{
      ok: boolean;
      outcome: "deleted";
      message: string;
    }>();
    mocks.deleteTransaction.mockReturnValue(deletion.promise);
    const user = userEvent.setup();
    renderFlow();
    await openExpenseEditor(user);

    const deleteButton = screen.getByRole("button", {
      name: "Delete transaction",
    });
    const backButton = screen.getByRole("button", { name: "Go back" });
    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(deleteButton);
    act(() => {
      deleteButton.click();
      backButton.click();
      saveButton.click();
      mocks.dashboardEdit?.(mocks.expenseB);
    });

    await waitFor(() => {
      expect(mocks.deleteTransaction).toHaveBeenCalledTimes(1);
    });
    expect(mocks.updateMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.dbGet).not.toHaveBeenCalledWith("expense-2");
    expect(screen.queryByRole("button", { name: "Start expense" })).not.toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();

    await act(async () => {
      deletion.resolve({
        ok: true,
        outcome: "deleted",
        message: "Removed synced entry",
      });
      await deletion.promise;
    });
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
      "Checking reimbursements",
      true,
    ],
    [
      "remote error",
      { isError: true },
      "Unable to check reimbursements.",
      "Retry reimbursement check",
      false,
    ],
    [
      "currency mismatch",
      { summary: { currencyMismatchIds: ["child-bad"] } },
      "Currency mismatch in linked reimbursements",
      "Reimbursement unavailable",
      true,
    ],
    [
      "overage",
      { summary: { remaining: 0, overReimbursed: 10 } },
      "Over-reimbursed by THB 10",
      "Reimbursement unavailable",
      true,
    ],
    [
      "full",
      { summary: { confirmed: 80, queued: 20, remaining: 0 } },
      "Fully reimbursed",
      "Fully reimbursed",
      true,
    ],
  ])(
    "presents the %s balance as a silent action state",
    async (_label, state, previousMessage, accessibleName, isDisabled) => {
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

      for (const match of screen.queryAllByText(previousMessage, {
        exact: true,
      })) {
        expect(match).toHaveRole("status");
        expect(match).toHaveClass("sr-only");
      }
      const action = screen.getByRole("button", { name: accessibleName });
      if (isDisabled) {
        expect(action).toBeDisabled();
      } else {
        expect(action).toBeEnabled();
      }
    },
  );
});

describe("TransactionFlow linked reimbursement editing", () => {
  it("resolves a source outside recent rows, excludes the current child, and uses the reimbursement receipt", async () => {
    const resolvedSource = {
      ...mocks.expense,
      amount: 120,
      sheetRow: 77,
    };
    mocks.sourceQueryState.data = resolvedSource;
    Object.assign(mocks.summaryState.summary, {
      confirmed: 50,
      queued: 0,
      remaining: 70,
    });
    mocks.updateMutation.mutateAsync.mockImplementation(
      async ({ input }: { input: Partial<TransactionInput> }) => ({
        ...mocks.linkedChild,
        ...input,
        status: "synced",
        error: undefined,
      }),
    );
    const user = userEvent.setup();
    renderFlow();

    await openLinkedEditor(user);

    expect(mocks.sourceQueryCalls).toContain("expense-1");
    expect(
      mocks.summaryCalls.some(
        (call) =>
          call.source === resolvedSource &&
          call.excludeChildId === "linked-child",
      ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "THB" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Family" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Reimbursement" }),
    ).not.toBeInTheDocument();
    for (const key of Array.from(
      screen.getByRole("group", { name: "Amount keypad" }).querySelectorAll(
        "button",
      ),
    )) {
      expect(key).toBeEnabled();
    }

    await user.click(screen.getByRole("button", { name: "Delete digit" }));
    await user.click(screen.getByRole("button", { name: "Delete digit" }));
    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "0" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "linked-child",
        input: expect.objectContaining({
          amount: 70,
          type: "income",
          category: "Reimbursement",
          currency: "THB",
          for: "Family",
          reimbursesTransactionId: "expense-1",
        }),
      });
    });
    expect(
      await screen.findByText("Reimbursement recorded"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-timed-progress")).not.toBeInTheDocument();
  });

  it("rejects an amount above the other-child-adjusted maximum", async () => {
    Object.assign(mocks.summaryState.summary, {
      confirmed: 40,
      queued: 0,
      remaining: 60,
    });
    const user = userEvent.setup();
    renderFlow();
    await openLinkedEditor(user);

    await user.click(screen.getByRole("button", { name: "Delete digit" }));
    await user.click(screen.getByRole("button", { name: "Delete digit" }));
    await user.click(screen.getByRole("button", { name: "6" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.updateMutation.mutateAsync).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      "Amount exceeds remaining reimbursement balance",
    );
    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
  });

  it("allows metadata-only edits when the unchanged child amount now exceeds remaining", async () => {
    Object.assign(mocks.summaryState.summary, {
      confirmed: 90,
      queued: 0,
      remaining: 10,
    });
    mocks.updateMutation.mutateAsync.mockImplementation(
      async ({ input }: { input: Partial<TransactionInput> }) => ({
        ...mocks.linkedChild,
        ...input,
        status: "synced",
        error: undefined,
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await openLinkedEditor(user);

    const note = screen.getByPlaceholderText("Add a note...");
    await user.clear(note);
    await user.type(note, "Metadata correction");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "linked-child",
        input: expect.objectContaining({
          amount: 30,
          note: "Metadata correction",
          reimbursesTransactionId: "expense-1",
        }),
      });
    });
    expect(
      await screen.findByText("Reimbursement recorded"),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "loading",
      { data: undefined, isChecking: true, isLoading: true, isError: false },
      "Checking original expense...",
    ],
    [
      "error",
      { data: undefined, isChecking: false, isLoading: false, isError: true },
      "Unable to load original expense.",
    ],
  ])("locks amount while source resolution is %s", async (_label, state, copy) => {
    Object.assign(mocks.sourceQueryState, state);
    const user = userEvent.setup();
    renderFlow();

    await openLinkedEditor(user);

    expect(screen.getByText(copy)).toBeInTheDocument();
    for (const key of Array.from(
      screen.getByRole("group", { name: "Amount keypad" }).querySelectorAll(
        "button",
      ),
    )) {
      expect(key).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("allows missing-source metadata edits while preserving locked data and the exact date", async () => {
    mocks.sourceQueryState.data = null;
    mocks.updateMutation.mutateAsync.mockImplementation(
      async ({ input }: { input: Partial<TransactionInput> }) => ({
        ...mocks.linkedChild,
        ...input,
        status: "pending",
        error: undefined,
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await openLinkedEditor(user);

    expect(screen.getByText("Original expense unavailable")).toBeInTheDocument();
    for (const key of Array.from(
      screen.getByRole("group", { name: "Amount keypad" }).querySelectorAll(
        "button",
      ),
    )) {
      expect(key).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Wallet" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Delete transaction" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Wallet" }));
    const note = screen.getByPlaceholderText("Add a note...");
    await user.clear(note);
    await user.type(note, "Corrected repayment note");
    const dateButton = screen
      .getAllByRole("button")
      .find((button) => /\d{2} \w{3} · \d{2}:\d{2}/.test(button.textContent ?? ""));
    expect(dateButton).toBeDefined();
    await user.click(dateButton as HTMLButtonElement);
    await user.click(
      screen.getByRole("button", { name: "Set exact reimbursement date" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "linked-child",
        input: {
          type: "income",
          category: "Reimbursement",
          amount: 30,
          currency: "THB",
          account: "Wallet",
          for: "Family",
          date: "2026-08-14T07:08:09",
          note: "Corrected repayment note",
          reimbursesTransactionId: "expense-1",
        },
      });
    });
    expect(await screen.findByText("Reimbursement queued")).toBeInTheDocument();
  });

  it("blocks a missing-source save when amount or locked values were tampered", async () => {
    mocks.sourceQueryState.data = null;
    const user = userEvent.setup();
    renderFlow();
    await openLinkedEditor(user);

    act(() => {
      mocks.forms[0]?.setFieldValue("amount", "31");
      mocks.forms[0]?.setFieldValue("currency", "USD");
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.updateMutation.mutateAsync).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Original expense unavailable");
    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
  });

  it("reconstructs locked linked fields from the original child after form tampering", async () => {
    mocks.updateMutation.mutateAsync.mockImplementation(
      async ({ input }: { input: Partial<TransactionInput> }) => ({
        ...mocks.linkedChild,
        ...input,
        status: "synced",
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await openLinkedEditor(user);

    act(() => {
      mocks.forms[0]?.setFieldValue("type", "expense");
      mocks.forms[0]?.setFieldValue("category", "Tampered category");
      mocks.forms[0]?.setFieldValue("currency", "USD");
      mocks.forms[0]?.setFieldValue("forValue", "Me");
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "linked-child",
        input: expect.objectContaining({
          type: "income",
          category: "Reimbursement",
          currency: "THB",
          for: "Family",
          reimbursesTransactionId: "expense-1",
        }),
      });
    });
  });

  it("renders linked receipt data from the authoritative returned record", async () => {
    mocks.updateMutation.mutateAsync.mockResolvedValue({
      ...mocks.linkedChild,
      amount: 31,
      currency: "USD",
      account: "Remote account",
      for: "Partner",
      category: "Remote reimbursement",
      date: "2026-08-14T06:07:08.000Z",
      note: "Remote repayment note",
      status: "pending",
      updatedAt: "2026-08-15T12:00:00.000Z",
    });
    const user = userEvent.setup();
    renderFlow();
    await openLinkedEditor(user);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Reimbursement queued")).toBeInTheDocument();
    expect(screen.getByText("USD 31")).toBeInTheDocument();
    expect(screen.getByText("Remote reimbursement")).toBeInTheDocument();
    expect(screen.getByText("Remote account")).toBeInTheDocument();
    expect(screen.getByText("Partner")).toBeInTheDocument();
    expect(screen.getByText("Remote repayment note")).toBeInTheDocument();
  });

  it("keeps a failed child open on error and retries the same ID into a queued receipt", async () => {
    const latestErrorRecord = {
      ...mocks.failedLinkedChild,
      category: "Remote reimbursement",
      error: "Amount exceeds remaining reimbursement balance",
      updatedAt: "2026-08-15T11:00:00.000Z",
    };
    mocks.updateMutation.mutateAsync
      .mockRejectedValueOnce(
        new UpdateTransactionRecordError(
          "Amount exceeds remaining reimbursement balance",
          latestErrorRecord,
        ),
      )
      .mockResolvedValueOnce({
        ...latestErrorRecord,
        status: "pending",
        error: undefined,
      });
    const user = userEvent.setup();
    renderFlow();
    await openFailedLinkedEditor(user);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Amount exceeds remaining reimbursement balance",
      );
    });
    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
    expect(screen.queryByText("Reimbursement recorded")).not.toBeInTheDocument();
    expect(mocks.updateMutation.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "failed-linked-child" }),
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Reimbursement queued")).toBeInTheDocument();
    expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.updateMutation.mutateAsync).toHaveBeenLastCalledWith(
      {
        id: "failed-linked-child",
        input: expect.objectContaining({
          category: "Remote reimbursement",
        }),
      },
    );
  });

  it("deletes a failed linked child by its exact ID", async () => {
    const user = userEvent.setup();
    renderFlow();
    await openFailedLinkedEditor(user);

    const remove = screen.getByRole("button", { name: "Delete transaction" });
    await user.click(remove);
    await user.click(remove);

    await waitFor(() => {
      expect(mocks.deleteTransaction).toHaveBeenCalledWith(
        "failed-linked-child",
      );
    });
    expect(
      mocks.summaryCalls.some(
        (call) => call.excludeChildId === "failed-linked-child",
      ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Edit expense" })).toBeVisible();
  });
});

describe("TransactionFlow reimbursement submission and receipt", () => {
  it("refreshes an ordinary edit receipt from the returned record", async () => {
    mocks.updateMutation.mutateAsync.mockResolvedValue({
      ...mocks.income,
      amount: 250,
      currency: "USD",
      account: "Remote account",
      for: "Partner",
      category: "Remote salary",
      date: "2026-08-14T06:07:08.000Z",
      note: "Remote ordinary note",
      updatedAt: "2026-08-15T12:00:00.000Z",
    });
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit income" }));
    await screen.findByText("Salary");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("USD 250")).toBeInTheDocument();
    expect(screen.getByText("Remote salary")).toBeInTheDocument();
    expect(screen.getByText("Remote account")).toBeInTheDocument();
    expect(screen.getByText("Partner")).toBeInTheDocument();
    expect(screen.getByText("Remote ordinary note")).toBeInTheDocument();
  });

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

  it("keeps an exact reimbursement undo on the receipt while its deletion is queued", async () => {
    mocks.deleteTransaction.mockResolvedValueOnce({
      ok: true,
      message: "Undo queued",
      outcome: "pending",
    });
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Reimbursement recorded");

    await user.click(
      screen.getByRole("button", { name: "Undo reimbursement" }),
    );

    expect(await screen.findByText("Undo queued")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This reimbursement stays counted until it is removed from Google Sheets.",
      ),
    ).toBeInTheDocument();
    expect(mocks.deleteTransaction).toHaveBeenCalledWith("child-exact");
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /undo reimbursement|retry undo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit expense" }),
    ).not.toBeInTheDocument();
  });

  it("locks Done and Undo to a single exact-child deletion and preserves retry after failure", async () => {
    const deletion = deferred<{
      ok: boolean;
      outcome: "deleted";
      message: string;
    }>();
    mocks.deleteTransaction.mockReturnValueOnce(deletion.promise);
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Reimbursement recorded");

    const done = screen.getByRole("button", { name: "Done" });
    const undo = screen.getByRole("button", { name: "Undo reimbursement" });
    await user.click(undo);
    await waitFor(() => {
      expect(done).toBeDisabled();
      expect(undo).toBeDisabled();
    });
    act(() => {
      done.click();
      undo.click();
    });
    expect(mocks.deleteTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.deleteTransaction).toHaveBeenCalledWith("child-exact");
    expect(screen.queryByRole("button", { name: "Edit expense" })).not.toBeInTheDocument();

    await act(async () => {
      deletion.reject(new Error("Could not remove reimbursement"));
      try {
        await deletion.promise;
      } catch {
        // The flow owns the surfaced failure.
      }
    });
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith("Could not remove reimbursement");
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Retry undo" }),
      ).toBeEnabled();
    });
    expect(screen.getByText("Undo failed")).toBeInTheDocument();
    expect(screen.getByText("Could not remove reimbursement")).toBeInTheDocument();

    mocks.deleteTransaction.mockResolvedValueOnce({
      ok: true,
      message: "Removed synced entry",
      outcome: "deleted",
    });
    await user.click(
      screen.getByRole("button", { name: "Retry undo" }),
    );
    await waitFor(() => {
      expect(mocks.deleteTransaction).toHaveBeenCalledTimes(2);
    });
    expect(mocks.deleteTransaction).toHaveBeenLastCalledWith("child-exact");
    expect(screen.getByRole("button", { name: "Edit expense" })).toBeVisible();
  });

  it("does not let Done reset the flow while exact reimbursement Undo succeeds", async () => {
    const deletion = deferred<{
      ok: boolean;
      outcome: "deleted";
      message: string;
    }>();
    mocks.deleteTransaction.mockReturnValue(deletion.promise);
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Reimbursement recorded");

    const undo = screen.getByRole("button", { name: "Undo reimbursement" });
    await user.click(undo);
    const done = screen.getByRole("button", { name: "Done" });
    await waitFor(() => expect(done).toBeDisabled());
    act(() => done.click());
    expect(screen.getByText("Reimbursement recorded")).toBeInTheDocument();

    await act(async () => {
      deletion.resolve({
        ok: true,
        outcome: "deleted",
        message: "Removed synced entry",
      });
      await deletion.promise;
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit expense" })).toBeVisible();
    });
    expect(mocks.deleteTransaction).toHaveBeenCalledTimes(1);
  });

  it("ignores a late exact-Undo success after an unrelated editor takes ownership", async () => {
    const deletion = deferred<{
      ok: boolean;
      outcome: "deleted";
      message: string;
    }>();
    mocks.deleteTransaction.mockReturnValue(deletion.promise);
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

    await act(async () => {
      mocks.dashboardEdit?.(mocks.expenseB);
    });
    expect(await screen.findByDisplayValue("Dinner")).toBeInTheDocument();

    await act(async () => {
      deletion.resolve({
        ok: true,
        outcome: "deleted",
        message: "Removed synced entry",
      });
      await deletion.promise;
    });
    expect(screen.getByDisplayValue("Dinner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start expense" })).not.toBeInTheDocument();
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

  it("retries a persisted error reimbursement by updating the same child ID", async () => {
    let errorChild!: TransactionRecord;
    mocks.addTransaction.mockImplementation(async (input: TransactionInput) => {
      errorChild = createChild(input, {
        status: "error",
        error: "Temporary reimbursement failure",
      });
      return errorChild;
    });
    mocks.updateMutation.mutateAsync
      .mockRejectedValueOnce(new Error("Still unable to sync reimbursement"))
      .mockImplementationOnce(async ({ input }) => ({
        ...errorChild,
        ...input,
        status: "pending",
        error: undefined,
      }));
    const user = userEvent.setup();
    renderFlow();
    await enterReimbursement(user);

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith("Temporary reimbursement failure");
    });
    expect(mocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(
      mocks.summaryCalls.some((call) => call.excludeChildId === "child-exact"),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Still unable to sync reimbursement",
      );
    });
    expect(screen.getByText("Reimbursement")).toBeInTheDocument();
    expect(mocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.updateMutation.mutateAsync).toHaveBeenLastCalledWith({
      id: "child-exact",
      input: {
        type: "income",
        category: "Reimbursement",
        amount: 60,
        currency: "THB",
        account: "Wallet",
        for: "Family",
        date: expect.any(String),
        note: "Lunch",
        reimbursesTransactionId: "expense-1",
      },
    });

    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Reimbursement queued")).toBeInTheDocument();
    expect(mocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.updateMutation.mutateAsync.mock.calls[1]?.[0]).toMatchObject({
      id: "child-exact",
    });
  });
});
