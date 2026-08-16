import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import { TransactionHistoryDrawer } from "./TransactionHistoryDrawer";

const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

const mocks = vi.hoisted(() => ({
  history: {
    records: [] as TransactionRecord[],
    meta: {
      sheetId: "sheet-a",
      capturedAt: "2026-08-15T10:00:00.000Z",
      sourceLastRow: 1,
      rowCount: 0,
    } as { capturedAt: string; rowCount: number; sheetId: string; sourceLastRow: number } | null,
    error: null as Error | null,
    hasCompleteCache: true,
    isLoading: false,
    isRefreshing: false,
    isDownloading: false,
    isOnline: true,
    refresh: vi.fn(),
  },
}));

vi.mock("./useTransactionHistoryQuery", () => ({
  useTransactionHistoryQuery: () => mocks.history,
}));

vi.mock("../ui/drawer", () => ({
  Drawer: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="history-drawer">{children}</div> : null),
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DrawerDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: "expense",
    amount: 10,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: `Category ${id}`,
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    sheetId: "sheet-a",
    sheetRow: 2,
    sheetRowValid: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function mockOffsetHeight(this: HTMLElement) {
      return this.dataset.virtualScroll === "true" ? 560 : 64;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function mockClientHeight(this: HTMLElement) {
      return this.dataset.virtualScroll === "true" ? 560 : 64;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function mockScrollHeight(this: HTMLElement) {
      return this.dataset.virtualScroll === "true" ? 10_000 : 64;
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function mockElementRect(this: HTMLElement) {
      const height = this.dataset.virtualScroll === "true" ? 560 : 64;
      return {
        bottom: height,
        height,
        left: 0,
        right: 390,
        top: 0,
        width: 390,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(function mockScrollTo(
      this: HTMLElement,
      options: ScrollToOptions | number,
      y?: number,
    ) {
      this.scrollTop =
        typeof options === "number" ? (y ?? 0) : (options.top ?? 0);
    }),
  });
  mocks.history.records = [];
  mocks.history.meta = {
    sheetId: "sheet-a",
    capturedAt: "2026-08-15T10:00:00.000Z",
    sourceLastRow: 1,
    rowCount: 0,
  };
  mocks.history.error = null;
  mocks.history.hasCompleteCache = true;
  mocks.history.isLoading = false;
  mocks.history.isRefreshing = false;
  mocks.history.isDownloading = false;
  mocks.history.isOnline = true;
  mocks.history.refresh.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollTo) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollTo",
      originalScrollTo,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

describe("TransactionHistoryDrawer", () => {
  it("virtualizes hundreds of rows while full search can reveal an older transaction", async () => {
    mocks.history.records = Array.from({ length: 500 }, (_, index) =>
      transaction(`row-${index}`, {
        category: index === 499 ? "Ancient travel" : `Category ${index}`,
        sheetRow: index + 2,
      }),
    );
    mocks.history.meta = {
      sheetId: "sheet-a",
      capturedAt: "2026-08-15T10:00:00.000Z",
      sourceLastRow: 501,
      rowCount: 500,
    };
    const user = userEvent.setup();

    render(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getAllByTestId("history-transaction-row").length,
      ).toBeLessThan(50);
    });
    expect(screen.queryByText("Ancient travel")).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", {
        name: "Search transaction history",
      }),
      "ancient",
    );

    expect(await screen.findByText("Ancient travel")).toBeInTheDocument();
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
  });

  it("preserves the exact scroll offset when a newer row is prepended", async () => {
    const originalRecords = Array.from({ length: 100 }, (_, index) =>
      transaction(`row-${index}`, { sheetRow: index + 2 }),
    );
    mocks.history.records = originalRecords;
    const rendered = render(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );
    const scrollElement = screen.getByRole("region", {
      name: "Transaction history",
    });
    expect(scrollElement).toHaveClass("pb-safe");
    const initialScrollTop = 64 * 20 + 17;
    scrollElement.scrollTop = initialScrollTop;
    fireEvent.scroll(scrollElement);
    const scrollToMock = vi.mocked(HTMLElement.prototype.scrollTo);
    scrollToMock.mockClear();

    mocks.history.records = [
      transaction("newest", { sheetRow: 102 }),
      ...originalRecords,
    ];
    rendered.rerender(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({ top: initialScrollTop + 64 }),
      );
    });
  });

  it("labels local status, prevents legacy edits, and closes before editing", async () => {
    const pending = transaction("pending", { status: "pending" });
    const failed = transaction("failed", {
      status: "error",
      error: "Network unavailable",
    });
    const legacy = transaction("row-8", {
      category: "Legacy row",
      sheetRowValid: false,
    });
    const pendingLegacy = transaction("row-9", {
      category: "Pending legacy row",
      status: "pending",
      sheetRowValid: false,
    });
    mocks.history.records = [pending, failed, legacy, pendingLegacy];
    const onOpenChange = vi.fn();
    const onEditTransaction = vi.fn();
    const user = userEvent.setup();

    render(
      <TransactionHistoryDrawer
        open
        onOpenChange={onOpenChange}
        onEditTransaction={onEditTransaction}
      />,
    );

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
    expect(screen.getAllByText("Read only")).toHaveLength(2);
    expect(screen.getByText("Legacy row").closest("button")).toBeDisabled();
    expect(
      screen.getByText("Pending legacy row").closest("button"),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Category pending/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onEditTransaction).toHaveBeenCalledWith(pending);
  });

  it("explains when offline history has never been downloaded", () => {
    mocks.history.records = [];
    mocks.history.meta = null;
    mocks.history.hasCompleteCache = false;
    mocks.history.isOnline = false;

    render(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Connect once to download transaction history."),
    ).toBeInTheDocument();
  });

  it("shows a pending local row while offline history is incomplete", async () => {
    mocks.history.records = [
      transaction("offline-pending", { status: "pending" }),
    ];
    mocks.history.meta = null;
    mocks.history.hasCompleteCache = false;
    mocks.history.isOnline = false;

    render(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    expect(await screen.findByText("Category offline-pending")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing local entries. Connect to download full history.",
    );
  });

  it("keeps a pending local row visible during the initial history download", async () => {
    mocks.history.records = [
      transaction("downloading-pending", { status: "pending" }),
    ];
    mocks.history.meta = null;
    mocks.history.hasCompleteCache = false;
    mocks.history.isDownloading = true;

    render(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Category downloading-pending"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing local entries while full history downloads.",
    );
  });

  it("keeps cached rows visible with a retry when refresh fails", async () => {
    mocks.history.records = [transaction("cached")];
    mocks.history.error = new Error("Google unavailable");
    const user = userEvent.setup();

    render(
      <TransactionHistoryDrawer
        open
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    expect(await screen.findByText("Category cached")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Google unavailable");
    await user.click(screen.getByRole("button", { name: "Retry history refresh" }));
    await waitFor(() => expect(mocks.history.refresh).toHaveBeenCalled());
  });
});
