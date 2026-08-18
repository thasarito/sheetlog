import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import { CategoryStepSheetAccessoryProvider } from "./CategoryStepSheetAccessory";
import type { TransactionBaseAmountState } from "./transactionBaseAmounts";
import { TransactionHistoryView } from "./TransactionHistoryView";
import { useTransactionBaseAmounts } from "./useTransactionBaseAmounts";
import type { TransactionHistoryQueryResult } from "./useTransactionHistoryQuery";

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
    hasLocalSnapshot: true,
    remoteStatus: "success" as const,
    remoteFetchedAt: undefined as number | undefined,
    remoteError: null as Error | null,
    refresh: vi.fn(),
  },
  baseAmountStates: {} as Record<string, TransactionBaseAmountState>,
  rateRefetch: vi.fn(),
}));

vi.mock("./useTransactionBaseAmounts", () => ({
  useTransactionBaseAmounts: vi.fn(() => ({
    states: mocks.baseAmountStates,
    refetch: mocks.rateRefetch,
    isRefreshing: false,
  })),
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

function TransactionHistoryViewHarness({
  baseCurrency,
  onEditTransaction,
}: {
  open: boolean;
  baseCurrency: string;
  onOpenChange: (open: boolean) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
}) {
  return (
    <TransactionHistoryView
      history={mocks.history as TransactionHistoryQueryResult}
      baseCurrency={baseCurrency}
      onEditTransaction={onEditTransaction}
    />
  );
}

function SheetAccessoryHarness({
  reportHeight,
}: {
  reportHeight: (height: number) => void;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  return (
    <CategoryStepSheetAccessoryProvider
      value={{ provided: true, host, reportHeight }}
    >
      <div ref={setHost} data-testid="test-sheet-accessory-host" />
      <TransactionHistoryView
        history={mocks.history as TransactionHistoryQueryResult}
        baseCurrency="THB"
        onEditTransaction={vi.fn()}
      />
    </CategoryStepSheetAccessoryProvider>
  );
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
  mocks.history.hasLocalSnapshot = true;
  mocks.history.remoteStatus = "success";
  mocks.history.remoteFetchedAt = undefined;
  mocks.history.remoteError = null;
  mocks.history.refresh.mockReset();
  mocks.baseAmountStates = {};
  mocks.rateRefetch.mockReset();
  vi.mocked(useTransactionBaseAmounts).mockClear();
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

describe("TransactionHistoryView", () => {
  it("renders the full history surface without modal controls", () => {
    mocks.history.records = [transaction("recent")];
    render(
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", {
      name: "Transactions",
      hidden: true,
    });
    expect(heading).toHaveClass("sr-only");
    expect(heading.closest("section")).toHaveClass("bg-transparent");
    expect(heading.closest("section")).not.toHaveClass("bg-card");
    expect(screen.getByTestId("transaction-history-content")).toHaveClass(
      "bg-transparent",
    );
    expect(screen.getByRole("region", { name: "Transaction history" })).toHaveAttribute(
      "data-dashboard-scroll",
      "true",
    );
    expect(
      within(screen.getByTestId("transaction-history-metadata")).getByRole(
        "button",
        { name: "Refresh transaction history" },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search transaction history" }),
    ).toBeVisible();
    const dock = screen.getByTestId("transaction-history-dock");
    expect(screen.getAllByTestId("transaction-history-dock")).toHaveLength(1);
    expect(screen.getByTestId("transaction-history-content")).toContainElement(
      dock,
    );
    expect(dock).toHaveClass("mx-3", "rounded-2xl");
    expect(dock.className).not.toMatch(/shadow/);
    expect(
      screen.getByRole("searchbox", { name: "Search transaction history" }),
    ).toHaveClass("h-11");
    expect(
      screen.queryByRole("button", { name: "Close transaction history" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("portals one measured dock and reserves its sheet occlusion", async () => {
    mocks.history.records = [transaction("recent")];
    const reportHeight = vi.fn();
    render(<SheetAccessoryHarness reportHeight={reportHeight} />);

    const host = screen.getByTestId("test-sheet-accessory-host");
    const dock = await screen.findByTestId("transaction-history-dock");
    expect(screen.getAllByTestId("transaction-history-dock")).toHaveLength(1);
    expect(host).toContainElement(dock);
    expect(
      screen.getByTestId("transaction-history-content"),
    ).not.toContainElement(dock);
    await waitFor(() => expect(reportHeight).toHaveBeenCalledWith(64));
    expect(
      screen.getByRole("region", { name: "Transaction history" }),
    ).toHaveStyle({
      paddingBottom:
        "calc(var(--category-sheet-occlusion, env(safe-area-inset-bottom)) + var(--transaction-history-dock-height, 104px) + 8px)",
      scrollPaddingBottom:
        "calc(var(--category-sheet-occlusion, env(safe-area-inset-bottom)) + var(--transaction-history-dock-height, 104px) + 8px)",
    });
  });

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
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
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
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );
    const scrollElement = screen.getByRole("region", {
      name: "Transaction history",
    });
    expect(scrollElement).toHaveStyle({
      paddingBottom:
        "var(--category-sheet-occlusion, env(safe-area-inset-bottom))",
      scrollPaddingBottom:
        "var(--category-sheet-occlusion, env(safe-area-inset-bottom))",
    });
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
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
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

  it("resets to the top when search removes the current scroll anchor", async () => {
    mocks.history.records = Array.from({ length: 100 }, (_, index) =>
      transaction(`row-${index}`, {
        category: index === 0 ? "Needle category" : `Category ${index}`,
        sheetRow: index + 2,
      }),
    );
    const user = userEvent.setup();
    render(
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );
    const scrollElement = screen.getByRole("region", {
      name: "Transaction history",
    });
    scrollElement.scrollTop = 64 * 20;
    fireEvent.scroll(scrollElement);
    const scrollToMock = vi.mocked(HTMLElement.prototype.scrollTo);
    scrollToMock.mockClear();

    await user.type(
      screen.getByRole("searchbox", { name: "Search transaction history" }),
      "needle",
    );

    await waitFor(() =>
      expect(scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({ top: 0 }),
      ),
    );
    expect(await screen.findByText("Needle category")).toBeInTheDocument();
  });

  it("labels local status, prevents legacy edits, and selects editable rows", async () => {
    const pending = transaction("pending", { status: "pending" });
    const failed = transaction("failed", {
      status: "error",
      error: "Network unavailable",
    });
    const failedWithoutReason = transaction("failed-without-reason", {
      status: "error",
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
    mocks.history.records = [
      pending,
      failed,
      failedWithoutReason,
      legacy,
      pendingLegacy,
    ];
    const onOpenChange = vi.fn();
    const onEditTransaction = vi.fn();
    const user = userEvent.setup();

    render(
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
        onOpenChange={onOpenChange}
        onEditTransaction={onEditTransaction}
      />,
    );

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Network unavailable")).toBeInTheDocument();
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
    expect(screen.getAllByText("Read only")).toHaveLength(2);
    expect(screen.getByText("Network unavailable").closest("button")).toBeEnabled();
    expect(screen.getByText("Legacy row").closest("button")).toBeDisabled();
    expect(
      screen.getByText("Pending legacy row").closest("button"),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Category pending/i }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onEditTransaction).toHaveBeenCalledWith(pending);
  });

  it("explains when offline history has never been downloaded", () => {
    mocks.history.records = [];
    mocks.history.meta = null;
    mocks.history.hasCompleteCache = false;
    mocks.history.isOnline = false;

    render(
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
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
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
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
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
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
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    expect(await screen.findByText("Category cached")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Google unavailable");
    await user.click(screen.getByRole("button", { name: "Retry history refresh" }));
    await waitFor(() => expect(mocks.history.refresh).toHaveBeenCalled());
  });

  it("converts the complete record set independently of search and refreshes rates", async () => {
    const foreign = transaction("foreign", {
      amount: 3,
      currency: "USD",
      category: "Foreign coffee",
    });
    const local = transaction("local", { category: "Local lunch" });
    mocks.history.records = [foreign, local];
    mocks.baseAmountStates = {
      foreign: { status: "ready", currency: "THB", amount: 100 },
    };
    const user = userEvent.setup();

    render(
      <TransactionHistoryViewHarness
        open
        baseCurrency="THB"
        onOpenChange={vi.fn()}
        onEditTransaction={vi.fn()}
      />,
    );

    expect(await screen.findByText("≈ −฿100.00")).toBeInTheDocument();
    await user.type(
      screen.getByRole("searchbox", { name: "Search transaction history" }),
      "foreign",
    );
    expect(await screen.findByText("1 transaction")).toBeInTheDocument();
    expect(useTransactionBaseAmounts).toHaveBeenLastCalledWith(
      mocks.history.records,
      "THB",
      true,
    );

    await user.click(
      screen.getByRole("button", { name: "Refresh transaction history" }),
    );
    expect(mocks.history.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.rateRefetch).toHaveBeenCalledTimes(1);
  });
});
