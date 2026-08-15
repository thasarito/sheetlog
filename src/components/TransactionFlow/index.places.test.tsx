import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import type { TransactionRecord, TransactionType } from "../../lib/types";
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
}));

vi.mock("../../app/providers", () => ({
  useConnectivity: () => ({ isOnline: mocks.isOnline }),
  useTransactions: () => ({
    undoLast: vi.fn(async () => ({ message: "Undone" })),
    lastSyncError: null,
    lastSyncErrorAt: null,
  }),
}));

vi.mock("../../hooks/useOnboarding", () => ({
  useOnboarding: () => ({
    onboarding: {
      accounts: [{ name: "Wallet" }],
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
  status: "synced",
  createdAt: "2026-08-15T08:00:00",
  updatedAt: "2026-08-15T08:00:00",
};

vi.mock("./TopDashboard", () => ({
  TopDashboard: ({
    onEditTransaction,
  }: {
    onEditTransaction: (transaction: TransactionRecord) => void;
  }) => (
    <button type="button" onClick={() => onEditTransaction(editableExpense)}>
      Edit expense
    </button>
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
  const noteInput = screen.getByPlaceholderText("Add a note...");
  await user.type(noteInput, "Lunch");
  await user.click(screen.getByRole("button", { name: "Search places" }));
  const searchInput = await screen.findByRole("searchbox", {
    name: "Search places",
  });
  await user.type(searchInput, "coffee");
  await user.click(
    await screen.findByRole("button", {
      name: /Coffee House.*123 Main Street/i,
    })
  );
  await screen.findByText("Selecting place…");
  return noteInput;
}

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
  });
});

beforeEach(() => {
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

  let tokenNumber = 0;
  mocks.createSession.mockImplementation(async () => ({
    token: { id: `token-${++tokenNumber}` },
  }));
  mocks.searchSuggestions.mockResolvedValue([coffeeHouse]);
  mocks.resolveSuggestion.mockResolvedValue("Coffee House Resolved");
  mocks.dbGet.mockResolvedValue(undefined);
  mocks.dbPut.mockResolvedValue(undefined);
  mocks.addMutation.mutateAsync.mockResolvedValue(undefined);
  mocks.updateMutation.mutateAsync.mockResolvedValue(undefined);
});

describe("TransactionFlow Places integration", () => {
  it("gates Places to create-expense amount entry and starts a fresh nearby session", async () => {
    const user = userEvent.setup();
    renderFlow();

    expect(latestNearbyCall()).toMatchObject({ enabled: false, isOnline: true });

    await user.click(screen.getByRole("button", { name: "Start expense" }));

    expect(await screen.findByRole("button", { name: "Search places" })).toBeVisible();
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

    expect(screen.queryByRole("button", { name: "Search places" })).not.toBeInTheDocument();
    expect(latestNearbyCall()).toMatchObject({ enabled: false, isOnline: true });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("does not expose or load Places while editing an expense", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Edit expense" }));

    expect(await screen.findByDisplayValue("Original note")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Search places" })).not.toBeInTheDocument();
    expect(latestNearbyCall()).toMatchObject({ enabled: false, isOnline: true });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it.each([
    ["offline", false, true],
    ["without a key", true, false],
  ])("keeps Search disabled %s", async (_label, isOnline, hasMapsKey) => {
    mocks.isOnline = isOnline;
    mocks.hasMapsKey = hasMapsKey;
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Start expense" }));

    expect(screen.queryByRole("button", { name: "Search places" })).not.toBeInTheDocument();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("opens an empty focused search, resolves a place name, and restores Search focus", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Start expense" }));

    const noteInput = screen.getByPlaceholderText("Add a note...");
    await user.type(noteInput, "Lunch");
    const searchButton = screen.getByRole("button", { name: "Search places" });
    await user.click(searchButton);

    const searchInput = await screen.findByRole("searchbox", { name: "Search places" });
    await waitFor(() => expect(searchInput).toHaveFocus());
    expect(searchInput).toHaveValue("");

    await user.type(searchInput, "coffee");
    const result = await screen.findByRole("button", {
      name: /Coffee House.*123 Main Street/i,
    });
    await user.click(result);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Search places" })).toHaveAttribute(
        "data-state",
        "closed"
      );
    });
    expect(noteInput).toHaveValue("Coffee House Resolved");
    await waitFor(() => expect(searchButton).toHaveFocus());
    expect(mocks.resolveSuggestion).toHaveBeenCalledWith(
      coffeeHouse,
      expect.objectContaining({ token: expect.any(Object) })
    );
  });

  it("keeps the drawer, query, and note intact when place resolution fails", async () => {
    mocks.resolveSuggestion.mockRejectedValueOnce(new Error("selection failed"));
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    const noteInput = screen.getByPlaceholderText("Add a note...");
    await user.type(noteInput, "Lunch");
    await user.click(screen.getByRole("button", { name: "Search places" }));
    const searchInput = await screen.findByRole("searchbox", { name: "Search places" });
    await user.type(searchInput, "coffee");

    await user.click(
      await screen.findByRole("button", {
        name: /Coffee House.*123 Main Street/i,
      })
    );

    expect(
      await screen.findByText("Couldn’t select that place. Tap it again.")
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Search places" })).toBeVisible();
    expect(searchInput).toHaveValue("coffee");
    expect(noteInput).toHaveValue("Lunch");
  });

  it("ignores a deferred selection after Places eligibility is lost", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    const { rerenderFlow } = renderFlow();
    const noteInput = await beginDeferredPlaceSelection(user, selection);

    mocks.isOnline = false;
    rerenderFlow();
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Search places" })
      ).toHaveAttribute("data-state", "closed");
    });

    await act(async () => selection.resolve("Stale Coffee House"));

    expect(noteInput).toHaveValue("Lunch");
    expect(screen.queryByRole("button", { name: "Search places" })).not.toBeInTheDocument();
  });

  it("does not let an old selection alter or close a newly reopened search", async () => {
    const selection = deferred<string>();
    const user = userEvent.setup();
    const { rerenderFlow } = renderFlow();
    const noteInput = await beginDeferredPlaceSelection(user, selection);

    mocks.isOnline = false;
    rerenderFlow();
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Search places" })
      ).toHaveAttribute("data-state", "closed");
    });

    mocks.isOnline = true;
    rerenderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Search places" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Search places" })
      ).toHaveAttribute("data-state", "open");
    });
    const reopenedSearchInput = screen.getByRole("searchbox", {
      name: "Search places",
    });
    await waitFor(() => expect(reopenedSearchInput).toHaveFocus());

    await act(async () => selection.resolve("Stale Coffee House"));

    expect(noteInput).toHaveValue("Lunch");
    expect(
      screen.getByRole("dialog", { name: "Search places" })
    ).toHaveAttribute("data-state", "open");
    expect(reopenedSearchInput).toHaveFocus();
    expect(mocks.createSession).toHaveBeenCalledTimes(2);
  });

  it("clears search state and creates a new autocomplete session after closing", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Start expense" }));
    const searchButton = screen.getByRole("button", { name: "Search places" });
    await user.click(searchButton);
    const searchInput = await screen.findByRole("searchbox", { name: "Search places" });
    await user.type(searchInput, "coffee");
    await screen.findByRole("button", { name: /Coffee House.*123 Main Street/i });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Search places" })).toHaveAttribute(
        "data-state",
        "closed"
      );
    });
    await waitFor(() => expect(searchButton).toHaveFocus());

    await user.click(searchButton);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Search places" })).toHaveAttribute(
        "data-state",
        "open"
      );
    });
    const reopenedInput = screen.getByRole("searchbox", { name: "Search places" });
    expect(reopenedInput).toHaveValue("");
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(2));
  });
});
