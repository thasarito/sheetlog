import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import type {
  TransactionRecord,
  TransactionType,
  TransactionUpdateInput,
} from "../../lib/types";
import { TransactionFlow } from "./index";

const coffeeHouse = {
  placeId: "coffee-house",
  name: "Coffee House",
  secondaryText: "123 Main Street",
} satisfies PlaceSuggestion;

const mocks = vi.hoisted(() => ({
  isOnline: true,
  hasMapsKey: true,
  nearbySuggestions: [] as PlaceSuggestion[],
  nearbyCalls: [] as Array<{
    enabled: boolean;
    isOnline?: boolean;
    sessionId: string | number;
  }>,
  createSession: vi.fn(),
  endSession: vi.fn(),
  searchSuggestions: vi.fn(),
  resolveSuggestion: vi.fn(),
  dbGet: vi.fn(),
  dbPut: vi.fn(),
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
  deleteMutation: {
    isPending: false,
    mutate: vi.fn(),
  },
  reimbursementMutation: {
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("../../app/providers", () => ({
  useConnectivity: () => ({ isOnline: mocks.isOnline }),
  useSession: () => ({
    userProfile: { id: "user-a", name: "Test user", picture: null },
  }),
  useWorkspace: () => ({ sheetId: "sheet-a" }),
  useTransactions: () => ({
    undoLast: vi.fn(async () => ({ message: "Undone" })),
    lastSyncError: null,
    lastSyncErrorAt: null,
  }),
}));

vi.mock("../../hooks/useOnboarding", () => ({
  useOnboarding: () => ({
    onboarding: {
      accounts: [{ name: "Wallet" }, { name: "Bank" }],
      categories: {
        expense: [{ name: "Coffee" }],
        income: [{ name: "Salary" }],
        transfer: [{ name: "Transfer" }],
      },
    },
    refreshOnboarding: vi.fn(async () => false),
  }),
}));

vi.mock("../../lib/googlePlaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/googlePlaces")>();
  return {
    ...actual,
    hasGoogleMapsApiKey: () => mocks.hasMapsKey,
    createPlaceAutocompleteSession: mocks.createSession,
    endPlaceAutocompleteSession: mocks.endSession,
    searchPlaceSuggestions: mocks.searchSuggestions,
    resolvePlaceSuggestionName: mocks.resolveSuggestion,
  };
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
  useNearbyPlaceSuggestions: (options: {
    enabled: boolean;
    isOnline?: boolean;
    sessionId: string | number;
  }) => {
    mocks.nearbyCalls.push(options);
    const canSearch =
      options.enabled && options.isOnline === true && mocks.hasMapsKey;
    return {
      suggestions: options.enabled ? mocks.nearbySuggestions : [],
      coordinates: options.enabled ? { lat: 13.7466, lng: 100.5347 } : undefined,
      isLoading: false,
      canSearch,
    };
  },
}));

vi.mock("./useAddTransactionMutation", () => ({
  useAddTransactionMutation: () => mocks.addMutation,
}));

vi.mock("./useUpdateTransactionMutation", () => ({
  useUpdateTransactionMutation: () => mocks.updateMutation,
}));

vi.mock("./useDeleteTransactionMutation", () => ({
  useDeleteTransactionMutation: () => mocks.deleteMutation,
}));

vi.mock("./useCreateReimbursementMutation", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./useCreateReimbursementMutation")
  >();
  return {
    ...actual,
    useCreateReimbursementMutation: () => mocks.reimbursementMutation,
  };
});

vi.mock("./useReimbursementSummary", () => ({
  useReimbursementSummary: ({ source }: { source: TransactionRecord | null }) => ({
    summary: {
      confirmed: 0,
      queued: 0,
      remaining: source?.amount ?? 0,
      overReimbursed: 0,
      currencyMismatchIds: [],
    },
    isChecking: false,
    isError: false,
    retry: vi.fn(async () => undefined),
    needsOnlineVerification: false,
  }),
}));

vi.mock("./useTransactionByIdQuery", () => ({
  useTransactionByIdQuery: (id: string | null | undefined) => ({
    data: id ? editableExpense : null,
    isChecking: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  }),
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
    form: {
      setFieldValue: (field: string, value: unknown) => void;
    };
    onConfirm: () => void;
  }) => {
    const start = (type: TransactionType, category: string) => {
      form.setFieldValue("type", type);
      if (type !== "expense") form.setFieldValue("place", undefined);
      form.setFieldValue("category", category);
      onConfirm();
    };
    return (
      <div>
        <button type="button" onClick={() => start("expense", "Coffee")}>
          Start expense
        </button>
        <button type="button" onClick={() => start("income", "Salary")}>
          Start income
        </button>
        <button type="button" onClick={() => start("transfer", "Transfer")}>
          Start transfer
        </button>
      </div>
    );
  },
}));

const editableExpense: TransactionRecord = {
  id: "expense-1",
  type: "expense",
  amount: 125,
  currency: "THB",
  account: "Wallet",
  for: "Me",
  category: "Coffee",
  date: "2026-08-15T08:00:00",
  note: "Original note",
  place: { provider: "google", placeId: "original-place" },
  status: "synced",
  createdAt: "2026-08-15T08:00:00",
  updatedAt: "2026-08-15T08:00:00",
};

const linkedReimbursement: TransactionRecord = {
  id: "reimbursement-1",
  type: "income",
  amount: 40,
  currency: "THB",
  account: "Wallet",
  for: "Household",
  category: "Reimbursement",
  date: "2026-08-15T09:00:00",
  note: "Coffee repayment",
  place: { provider: "google", placeId: "repayment-place" },
  reimbursesTransactionId: "expense-1",
  status: "synced",
  createdAt: "2026-08-15T09:00:00",
  updatedAt: "2026-08-15T09:00:00",
};

vi.mock("./TopDashboard", () => ({
  TopDashboard: ({
    onEditTransaction,
  }: {
    onEditTransaction: (transaction: TransactionRecord) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onEditTransaction(editableExpense)}>
        Edit expense
      </button>
      <button
        type="button"
        onClick={() => onEditTransaction(linkedReimbursement)}
      >
        Edit linked reimbursement
      </button>
    </div>
  ),
}));

vi.mock("../DateTimeDrawer", () => ({ DateTimeDrawer: () => null }));
vi.mock("../CategoryGridDrawer", () => ({ CategoryGridDrawer: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

function renderFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const createUi = () => (
    <QueryClientProvider client={queryClient}>
      <TransactionFlow />
    </QueryClientProvider>
  );
  const rendered = render(createUi());
  return {
    ...rendered,
    rerenderFlow: () => rendered.rerender(createUi()),
  };
}

function latestNearbyCall() {
  return mocks.nearbyCalls.at(-1);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function beginDeferredPlaceSelection(
  user: ReturnType<typeof userEvent.setup>,
  selection: ReturnType<typeof deferred<string>>
) {
  mocks.resolveSuggestion.mockReturnValueOnce(selection.promise);
  await user.click(screen.getByRole("button", { name: "Start expense" }));
  const noteInput = screen.getByRole("combobox", {
    name: "Transaction note",
  });
  await user.type(noteInput, "coffee");
  await user.click(
    await screen.findByRole("option", {
      name: /Coffee House.*123 Main Street/i,
    }),
  );
  await waitFor(() => expect(mocks.resolveSuggestion).toHaveBeenCalled());
  return noteInput;
}

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
  mocks.isOnline = true;
  mocks.hasMapsKey = true;
  mocks.nearbySuggestions = [];
  mocks.nearbyCalls.length = 0;
  mocks.createSession.mockReset();
  mocks.endSession.mockReset();
  mocks.searchSuggestions.mockReset();
  mocks.resolveSuggestion.mockReset();
  mocks.dbGet.mockReset();
  mocks.dbPut.mockReset();
  mocks.addMutation.mutateAsync.mockReset();
  mocks.addMutation.reset.mockReset();
  mocks.updateMutation.mutateAsync.mockReset();
  mocks.updateMutation.reset.mockReset();
  mocks.deleteMutation.mutate.mockReset();
  mocks.reimbursementMutation.mutateAsync.mockReset();
  mocks.reimbursementMutation.reset.mockReset();

  let tokenNumber = 0;
  mocks.createSession.mockImplementation(async () => ({
    token: { id: `token-${++tokenNumber}` },
  }));
  mocks.searchSuggestions.mockResolvedValue([coffeeHouse]);
  mocks.resolveSuggestion.mockResolvedValue("Coffee House Resolved");
  mocks.dbGet.mockResolvedValue(undefined);
  mocks.dbPut.mockResolvedValue(undefined);
  mocks.addMutation.mutateAsync.mockResolvedValue(undefined);
  mocks.updateMutation.mutateAsync.mockImplementation(
    async ({
      id,
      input,
    }: {
      id: string;
      input: TransactionUpdateInput;
    }) => {
      const base = id === editableExpense.id ? editableExpense : linkedReimbursement;
      const { place: placePatch, ...recordPatch } = input;
      return {
        ...base,
        ...recordPatch,
        ...(placePatch === null
          ? { place: undefined }
          : placePatch
            ? { place: placePatch }
            : {}),
        id,
        status: "synced" as const,
        error: undefined,
      };
    },
  );
});

describe("TransactionFlow Places integration", () => {
  it("selects an inline result and submits structured place metadata", async () => {
    const user = userEvent.setup();
    mocks.resolveSuggestion.mockResolvedValueOnce("Coffee House");
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));

    const note = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(note, "coffee");
    await user.click(
      await screen.findByRole("option", { name: /Coffee House/ }),
    );
    expect(note).toHaveValue("Coffee House");

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(mocks.addMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          note: "Coffee House",
          place: { provider: "google", placeId: "coffee-house" },
        }),
      );
    });
  });

  it("hydrates an ordinary place and emits an explicit clear patch", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    expect(await screen.findByLabelText("Transaction note")).toHaveValue(
      "Original note",
    );
    await user.click(screen.getByRole("button", { name: "Clear note" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "expense-1",
        input: {
          type: "expense",
          category: "Coffee",
          amount: 125,
          currency: "THB",
          account: "Wallet",
          for: "Me",
          date: "2026-08-15T08:00:00",
          note: undefined,
          place: null,
        },
      });
    });
  });

  it("preserves an ordinary place on a nonblank metadata edit", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    await user.type(
      await screen.findByLabelText("Transaction note"),
      " updated",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "expense-1",
        input: {
          type: "expense",
          category: "Coffee",
          amount: 125,
          currency: "THB",
          account: "Wallet",
          for: "Me",
          date: "2026-08-15T08:00:00",
          note: "Original note updated",
        },
      });
    });
  });

  it("hydrates a linked child place and preserves it on a nonblank edit", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Edit linked reimbursement" }),
    );
    const note = await screen.findByLabelText("Transaction note");
    expect(note).toHaveValue("Coffee repayment");
    await user.type(note, " updated");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "reimbursement-1",
        input: {
          type: "income",
          category: "Reimbursement",
          amount: 40,
          currency: "THB",
          account: "Wallet",
          for: "Household",
          date: "2026-08-15T09:00:00",
          note: "Coffee repayment updated",
          reimbursesTransactionId: "expense-1",
        },
      });
    });
  });

  it("emits a clear patch for the linked child's own place", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Edit linked reimbursement" }),
    );
    await screen.findByDisplayValue("Coffee repayment");
    await user.click(screen.getByRole("button", { name: "Clear note" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "reimbursement-1",
        input: {
          type: "income",
          category: "Reimbursement",
          amount: 40,
          currency: "THB",
          account: "Wallet",
          for: "Household",
          date: "2026-08-15T09:00:00",
          note: undefined,
          place: null,
          reimbursesTransactionId: "expense-1",
        },
      });
    });
  });

  it("gates Places to create-expense amount entry and starts a fresh nearby session", async () => {
    const user = userEvent.setup();
    renderFlow();

    expect(latestNearbyCall()).toMatchObject({ enabled: false, isOnline: true });

    await user.click(screen.getByRole("button", { name: "Start expense" }));

    expect(
      await screen.findByRole("combobox", { name: "Transaction note" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Search places" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const firstSession = latestNearbyCall()?.sessionId;
    expect(firstSession).toEqual(expect.any(String));
    expect(latestNearbyCall()).toMatchObject({ enabled: true, isOnline: true });

    await user.click(screen.getByRole("button", { name: "Go back" }));
    await user.click(screen.getByRole("button", { name: "Start expense" }));

    expect(latestNearbyCall()?.sessionId).not.toBe(firstSession);
  });

  it.each([
    ["income", "Start income"],
    ["transfer", "Start transfer"],
  ])("does not expose or load Places for %s entry", async (_type, buttonName) => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: buttonName }));

    expect(
      screen.getByRole("textbox", { name: "Transaction note" }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(latestNearbyCall()).toMatchObject({ enabled: false, isOnline: true });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("does not expose or load Places while editing an expense", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));

    expect(await screen.findByDisplayValue("Original note")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Transaction note" }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(latestNearbyCall()).toMatchObject({ enabled: false, isOnline: true });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it.each([
    ["offline", false, true],
    ["without a key", true, false],
  ])("keeps Places disabled %s", async (_label, isOnline, hasMapsKey) => {
    mocks.isOnline = isOnline;
    mocks.hasMapsKey = hasMapsKey;
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));

    expect(
      screen.getByRole("textbox", { name: "Transaction note" }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("starts after two characters, blurs after pointer selection, and does not search the selected name", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));

    const noteInput = screen.getByRole("combobox", {
      name: "Transaction note",
    });
    await user.type(noteInput, "c");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(mocks.createSession).not.toHaveBeenCalled();

    await user.type(noteInput, "o");
    const result = await screen.findByRole("option", {
      name: /Coffee House.*123 Main Street/i,
    });
    await user.click(result);

    expect(noteInput).toHaveValue("Coffee House Resolved");
    await waitFor(() => expect(noteInput).not.toHaveFocus());
    const searchCountAfterSelection = mocks.searchSuggestions.mock.calls.length;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(mocks.searchSuggestions).toHaveBeenCalledTimes(
      searchCountAfterSelection,
    );
    expect(mocks.resolveSuggestion).toHaveBeenCalledWith(
      coffeeHouse,
      expect.objectContaining({ token: expect.any(Object) }),
    );

    await user.type(noteInput, " updated");
    await screen.findByRole("option", { name: /Coffee House/ });
    expect(mocks.createSession).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(mocks.addMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          note: "Coffee House Resolved updated",
          place: { provider: "google", placeId: "coffee-house" },
        }),
      );
    });
  });

  it("keeps free text and the inline popup usable when place resolution fails", async () => {
    mocks.resolveSuggestion.mockRejectedValueOnce(new Error("selection failed"));
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    const noteInput = screen.getByRole("combobox", {
      name: "Transaction note",
    });
    await user.type(noteInput, "coffee");

    await user.click(
      await screen.findByRole("option", {
        name: /Coffee House.*123 Main Street/i,
      }),
    );

    expect(
      await screen.findByText(
        "Couldn’t select that place. Choose it again or edit the note.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(noteInput).toHaveValue("coffee");

    await user.click(screen.getByRole("option", { name: /Coffee House/ }));
    await waitFor(() => expect(noteInput).toHaveValue("Coffee House Resolved"));
  });

  it("ignores a deferred selection after Places eligibility is lost", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    const { rerenderFlow } = renderFlow();
    const noteInput = await beginDeferredPlaceSelection(user, selection);

    mocks.isOnline = false;
    rerenderFlow();
    expect(
      screen.getByRole("textbox", { name: "Transaction note" }),
    ).toBeVisible();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await act(async () => selection.resolve("Stale Coffee House"));

    expect(noteInput).toHaveValue("coffee");
  });

  it("ignores a deferred selection after Clear", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    renderFlow();
    const noteInput = await beginDeferredPlaceSelection(user, selection);

    await user.click(screen.getByRole("button", { name: "Clear note" }));
    await act(async () => selection.resolve("Stale Coffee House"));

    expect(noteInput).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(noteInput).toHaveFocus());
  });

  it("ignores a deferred selection after a newer manual query", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    renderFlow();
    const noteInput = await beginDeferredPlaceSelection(user, selection);

    await user.clear(noteInput);
    await user.type(noteInput, "tea");
    await act(async () => selection.resolve("Stale Coffee House"));

    expect(noteInput).toHaveValue("tea");
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(2));
  });

  it("ignores a deferred selection after Back and a create-type change", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    renderFlow();
    await beginDeferredPlaceSelection(user, selection);

    await user.click(screen.getByRole("button", { name: "Go back" }));
    await user.click(screen.getByRole("button", { name: "Start income" }));
    const noteInput = screen.getByRole("textbox", {
      name: "Transaction note",
    });
    await act(async () => selection.resolve("Stale Coffee House"));

    expect(noteInput).toHaveValue("coffee");
  });

  it("ignores a deferred selection after the receipt replaces the amount step", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    renderFlow();
    await beginDeferredPlaceSelection(user, selection);
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Transaction Summary");

    await act(async () => selection.resolve("Stale Coffee House"));

    expect(screen.getByText("coffee", { exact: true })).toBeVisible();
    expect(mocks.addMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ note: "coffee", place: undefined }),
    );
  });

  it("clear retires results, clears metadata, restores focus, and shows nearby chips", async () => {
    mocks.nearbySuggestions = [coffeeHouse];
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    const noteInput = screen.getByRole("combobox", {
      name: "Transaction note",
    });
    await user.type(noteInput, "coffee");
    await screen.findByRole("option", { name: /Coffee House/ });
    await user.click(screen.getByRole("button", { name: "Clear note" }));

    expect(noteInput).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(noteInput).toHaveFocus());
    expect(
      screen.getByRole("button", { name: "Use Coffee House as note" }),
    ).toBeVisible();
  });

  it("submits structured metadata from a nearby place chip", async () => {
    mocks.nearbySuggestions = [coffeeHouse];
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    await user.click(
      screen.getByRole("button", { name: "Use Coffee House as note" }),
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mocks.addMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          note: "Coffee House",
          place: { provider: "google", placeId: "coffee-house" },
        }),
      );
    });
  });

  it("keeps reimbursement entry as a plain note field without source place inheritance", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    await user.click(await screen.findByRole("button", { name: "Reimburse" }));

    expect(
      screen.getByRole("textbox", { name: "Transaction note" }),
    ).toHaveValue("Original note");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("preserves a place across Back and clears it when create type changes", async () => {
    mocks.nearbySuggestions = [coffeeHouse];
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));
    await user.click(
      screen.getByRole("button", { name: "Use Coffee House as note" }),
    );
    await user.click(screen.getByRole("button", { name: "Go back" }));
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    expect(
      screen.getByRole("combobox", { name: "Transaction note" }),
    ).toHaveValue("Coffee House");

    await user.click(screen.getByRole("button", { name: "Go back" }));
    await user.click(screen.getByRole("button", { name: "Start income" }));
    expect(
      screen.getByRole("textbox", { name: "Transaction note" }),
    ).toHaveValue("Coffee House");
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      const values = mocks.addMutation.mutateAsync.mock.calls.at(-1)?.[0];
      expect(values?.place).toBeUndefined();
    });
  });
});

describe("TransactionFlow linked reimbursement field effects", () => {
  it("locks linked currency and For controls while leaving account editable", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Edit linked reimbursement" })
    );

    expect(await screen.findByDisplayValue("Coffee repayment")).toBeVisible();
    expect(screen.getByRole("button", { name: "USD" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Work" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bank" })).toBeEnabled();
  });

  it("preserves linked currency and For when its editable account changes", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("sheetlog.lastCurrency", "USD");
    window.localStorage.setItem("sheetlog.lastCurrency_Wallet", "USD");
    window.localStorage.setItem("sheetlog.lastCurrency_Bank", "EUR");
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Edit linked reimbursement" })
    );
    await user.click(await screen.findByRole("button", { name: "Bank" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: "reimbursement-1",
        input: expect.objectContaining({
          account: "Bank",
          currency: "THB",
          for: "Household",
        }),
      });
    });
  });

  it("does not persist linked currency as an account or global preference", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("sheetlog.lastCurrency", "USD");
    window.localStorage.setItem("sheetlog.lastCurrency_Wallet", "USD");
    window.localStorage.setItem("sheetlog.lastCurrency_Bank", "EUR");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderFlow();
    await waitFor(() => {
      expect(setItem).toHaveBeenCalledWith("sheetlog.lastCurrency", "USD");
    });
    setItem.mockClear();

    await user.click(
      screen.getByRole("button", { name: "Edit linked reimbursement" })
    );
    await screen.findByDisplayValue("Coffee repayment");

    expect(
      setItem.mock.calls.filter(([key]) =>
        String(key).startsWith("sheetlog.lastCurrency")
      )
    ).toEqual([]);

    await user.click(await screen.findByRole("button", { name: "Bank" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("sheetlog.lastCurrency")).toBe("USD");
      expect(
        window.localStorage.getItem("sheetlog.lastCurrency_Wallet")
      ).toBe("USD");
      expect(
        window.localStorage.getItem("sheetlog.lastCurrency_Bank")
      ).toBe("EUR");
    });

    await user.click(screen.getByRole("button", { name: "Go back" }));
    await screen.findByRole("button", { name: "Edit linked reimbursement" });

    await waitFor(() => {
      expect(window.localStorage.getItem("sheetlog.lastCurrency")).toBe("USD");
      expect(
        window.localStorage.getItem("sheetlog.lastCurrency_Wallet")
      ).toBe("USD");
      expect(
        window.localStorage.getItem("sheetlog.lastCurrency_Bank")
      ).toBe("EUR");
    });
  });

  it("keeps per-account restoration and persistence for ordinary create", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("sheetlog.lastCurrency", "USD");
    window.localStorage.setItem("sheetlog.lastCurrency_Bank", "EUR");
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "Bank" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mocks.addMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          account: "Bank",
          currency: "EUR",
          forValue: "Me",
        })
      );
      expect(window.localStorage.getItem("sheetlog.lastCurrency")).toBe("EUR");
      expect(
        window.localStorage.getItem("sheetlog.lastCurrency_Bank")
      ).toBe("EUR");
    });
  });
});
