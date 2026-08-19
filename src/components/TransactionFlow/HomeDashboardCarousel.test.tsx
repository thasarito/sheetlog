import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TransactionRecord } from "../../lib/types";
import type { DashboardHeaderMotionHandle } from "../Header";
import type { SettingsViewProps } from "../SettingsView";
import type { AnalyticsViewProps } from "./AnalyticsView";
import { HomeDashboardCarousel } from "./HomeDashboardCarousel";
import type { TransactionHistoryViewProps } from "./TransactionHistoryView";
import type { AnalyticsSyncController } from "./useAnalyticsSync";

const transactionViewCalls: TransactionHistoryViewProps[] = [];
const analyticsViewCalls: AnalyticsViewProps[] = [];
const settingsViewCalls: SettingsViewProps[] = [];
const dockMotion = { setMotion: vi.fn() };
const resync = vi.fn();

const historyRecord: TransactionRecord = {
  id: "expense",
  type: "expense",
  amount: 100,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Dining Out",
  date: "2026-07-01T12:00:00",
  status: "synced",
  sheetRowValid: true,
  createdAt: "2026-07-01T12:00:00",
  updatedAt: "2026-07-01T12:00:00",
};

vi.mock("./TransactionHistoryView", () => ({
  TransactionHistoryView: (props: TransactionHistoryViewProps) => {
    transactionViewCalls.push(props);
    const motionRef = props.dockMotionRef as
      | { current: typeof dockMotion | null }
      | undefined;
    if (motionRef) motionRef.current = dockMotion;
    return (
      <section
        data-testid="transaction-history-scroll"
        data-dashboard-scroll="true"
      >
        Full Transactions view
      </section>
    );
  },
}));

vi.mock("./AnalyticsView", () => ({
  AnalyticsView: (props: AnalyticsViewProps) => {
    analyticsViewCalls.push(props);
    return (
      <section>
        <span>Full Analytics view</span>
        <button type="button" onClick={props.onNoBigSpendingToggle}>
          Toggle no big spending
        </button>
        <button type="button" data-home-carousel-swipe-lock="true">
          Nested analytics swipe target
        </button>
      </section>
    );
  },
}));

vi.mock("../SettingsView", () => ({
  SettingsView: (props: SettingsViewProps) => {
    settingsViewCalls.push(props);
    return (
      <section data-testid="settings-scroll" data-dashboard-scroll="true">
        <span>Full Settings view</span>
        <input aria-label="Settings draft" defaultValue="" />
        <button type="button" data-home-carousel-swipe-lock="true">
          Settings-owned swipe target
        </button>
      </section>
    );
  },
}));

const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth",
);
const originalScrollWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollWidth",
);
const originalScrollLeft = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollLeft",
);
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

let viewportWidth = 300;
let viewportScrollLeft = 0;
const scrollToMock = vi.fn(function scrollTo(
  this: HTMLElement,
  optionsOrX: ScrollToOptions | number,
) {
  if (this.dataset.testid !== "home-carousel-viewport") return;
  const nextLeft =
    typeof optionsOrX === "number"
      ? optionsOrX
      : (optionsOrX.left ?? viewportScrollLeft);
  viewportScrollLeft = Number(nextLeft);
});

Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return this.dataset.testid === "home-carousel-viewport"
      ? viewportWidth
      : 0;
  },
});
Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return this.dataset.testid === "home-carousel-viewport"
      ? viewportWidth * 3
      : 0;
  },
});
Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
  configurable: true,
  get(this: HTMLElement) {
    return this.dataset.testid === "home-carousel-viewport"
      ? viewportScrollLeft
      : 0;
  },
  set(this: HTMLElement, value: number) {
    if (this.dataset.testid === "home-carousel-viewport") {
      viewportScrollLeft = Number(value);
    }
  },
});
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: scrollToMock,
});

function restorePrototypeProperty(
  name: "clientWidth" | "scrollWidth" | "scrollLeft" | "scrollTo",
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
}

afterAll(() => {
  restorePrototypeProperty("clientWidth", originalClientWidth);
  restorePrototypeProperty("scrollWidth", originalScrollWidth);
  restorePrototypeProperty("scrollLeft", originalScrollLeft);
  restorePrototypeProperty("scrollTo", originalScrollTo);
});

function renderCarousel({
  status = "synced",
  onToast = vi.fn(),
  reducedMotion = false,
}: {
  status?: AnalyticsSyncController["status"];
  onToast?: (message: string) => void;
  reducedMotion?: boolean;
} = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function mockRect(this: HTMLElement) {
      const viewportLeft = 40;
      const slideIndex = Number(this.dataset.homeCarouselSlideIndex);
      const left = Number.isInteger(slideIndex)
        ? viewportLeft + slideIndex * viewportWidth - viewportScrollLeft
        : this.dataset.testid === "home-carousel-viewport"
          ? viewportLeft
          : 0;
      const width =
        Number.isInteger(slideIndex) ||
        this.dataset.testid === "home-carousel-viewport"
          ? viewportWidth
          : 0;
      return {
        bottom: 600,
        height: 600,
        left,
        right: left + width,
        top: 0,
        width,
        x: left,
        y: 0,
        toJSON: () => ({}),
      };
    },
  );
  const headerMotion: DashboardHeaderMotionHandle = {
    setHorizontalPosition: vi.fn(),
    setHorizontalMotion: vi.fn(),
    syncHorizontalSelection: vi.fn(),
    setVerticalProgress: vi.fn(),
  };
  const analyticsSync: AnalyticsSyncController = {
    history: {
      records: [historyRecord],
      meta: null,
      error: null,
      hasCompleteCache: true,
      hasLocalSnapshot: true,
      isLoading: false,
      isRefreshing: false,
      isDownloading: false,
      isOnline: status !== "offline",
      remoteStatus: "success",
      remoteFetchedAt: undefined,
      remoteError: null,
      refresh: vi.fn(),
    },
    records: [historyRecord],
    rates: [],
    hasLocalHistory: true,
    status,
    lastSyncedAt: "2026-08-17T12:00:00.000Z",
    isResyncing: false,
    resync,
  };
  render(
    <HomeDashboardCarousel
      baseCurrency="THB"
      bigSpendingThreshold={null}
      analyticsSync={analyticsSync}
      headerMotionRef={{ current: headerMotion }}
      onToast={onToast}
      onEditTransaction={vi.fn()}
    />,
  );
  return {
    analyticsSync,
    headerMotion,
    viewport: screen.getByTestId("home-carousel-viewport"),
  };
}

function scrollViewport(viewport: HTMLElement, left: number) {
  viewport.scrollLeft = left;
  fireEvent.scroll(viewport);
}

function settleViewport(viewport: HTMLElement) {
  fireEvent(viewport, new Event("scrollend"));
}

async function settleAt(viewport: HTMLElement, index: number) {
  scrollViewport(viewport, index * viewportWidth);
  settleViewport(viewport);
  await waitFor(() =>
    expect(
      screen.getByLabelText(
        `${["Analytics", "Transactions", "Settings"][index]}, slide ${index + 1} of 3`,
      ),
    ).not.toHaveAttribute("aria-hidden", "true"),
  );
}

describe("HomeDashboardCarousel", () => {
  beforeEach(() => {
    viewportWidth = 300;
    viewportScrollLeft = 0;
    scrollToMock.mockClear();
    analyticsViewCalls.splice(0);
    transactionViewCalls.splice(0);
    settingsViewCalls.splice(0);
    vi.mocked(dockMotion.setMotion).mockReset();
    resync.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the bounded order as native mandatory snap points", async () => {
    const { analyticsSync, viewport } = renderCarousel();
    const analytics = screen.getByLabelText("Analytics, slide 1 of 3");
    const transactions = screen.getByLabelText("Transactions, slide 2 of 3");
    const settings = screen.getByLabelText("Settings, slide 3 of 3");

    expect(viewport).toHaveClass("overflow-x-auto", "snap-x", "snap-mandatory");
    expect(analytics).toHaveClass("snap-start", "snap-always");
    expect(transactions).toHaveClass("snap-start", "snap-always");
    expect(settings).toHaveClass("snap-start", "snap-always");
    expect(analytics).not.toHaveAttribute("aria-hidden", "true");
    expect(transactions).toHaveAttribute("aria-hidden", "true");
    expect(settings).toHaveAttribute("aria-hidden", "true");
    expect(
      document.querySelector("[data-analytics-sheet-morph]"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(transactions.inert).toBe(true);
      expect(settings.inert).toBe(true);
    });
    expect(transactionViewCalls.at(-1)?.history).toBe(analyticsSync.history);
    expect(settingsViewCalls.at(-1)?.analyticsSync).toBe(analyticsSync);
  });

  it("publishes exact fractional scroll position and commits semantics only after settle", async () => {
    const { headerMotion, viewport } = renderCarousel();
    const analytics = screen.getByLabelText("Analytics, slide 1 of 3");
    const transactions = screen.getByLabelText("Transactions, slide 2 of 3");
    vi.mocked(headerMotion.setHorizontalPosition).mockClear();
    vi.mocked(headerMotion.syncHorizontalSelection).mockClear();
    vi.mocked(dockMotion.setMotion).mockClear();

    scrollViewport(viewport, 150);

    expect(headerMotion.setHorizontalPosition).toHaveBeenLastCalledWith(0.5);
    expect(viewport).toHaveAttribute("data-motion-position", "0.500");
    expect(viewport).toHaveAttribute("data-motion-status", "moving");
    expect(analytics).not.toHaveAttribute("aria-hidden", "true");
    expect(transactions).toHaveAttribute("aria-hidden", "true");
    expect(headerMotion.syncHorizontalSelection).not.toHaveBeenCalled();
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 150,
      viewportWidth: 300,
      interactive: false,
      moving: true,
    });

    scrollViewport(viewport, 300);
    settleViewport(viewport);

    await waitFor(() =>
      expect(transactions).not.toHaveAttribute("aria-hidden", "true"),
    );
    expect(headerMotion.syncHorizontalSelection).toHaveBeenLastCalledWith(
      "Transactions",
    );
    expect(viewport).toHaveAttribute("data-selected-snap", "1");
    expect(viewport).toHaveAttribute("data-motion-position", "1.000");
    expect(viewport).toHaveAttribute("data-motion-status", "settled");
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 0,
      viewportWidth: 300,
      interactive: true,
      moving: false,
    });
  });

  it("corrects an off-anchor scrollend before committing the destination", () => {
    const { viewport } = renderCarousel();
    const analytics = screen.getByLabelText("Analytics, slide 1 of 3");

    scrollViewport(viewport, 260);
    scrollToMock.mockClear();
    settleViewport(viewport);

    expect(scrollToMock).toHaveBeenCalledWith({
      left: 300,
      behavior: "smooth",
    });
    expect(analytics).not.toHaveAttribute("aria-hidden", "true");
    expect(viewport).toHaveAttribute("data-target-snap", "1");
    expect(viewport).toHaveAttribute("data-motion-status", "moving");
  });

  it("uses a debounced settle fallback when scrollend is unavailable", () => {
    vi.useFakeTimers();
    const { viewport } = renderCarousel();
    const transactions = screen.getByLabelText("Transactions, slide 2 of 3");

    scrollViewport(viewport, 300);
    expect(transactions).toHaveAttribute("aria-hidden", "true");

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(transactions).not.toHaveAttribute("aria-hidden", "true");
    expect(viewport).toHaveAttribute("data-selected-snap", "1");
  });

  it("moves one bounded page with arrow keys and keeps viewport focus", async () => {
    const { viewport } = renderCarousel();
    viewport.focus();
    scrollToMock.mockClear();

    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(viewport).toHaveFocus();

    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(scrollToMock).toHaveBeenLastCalledWith({
      left: 300,
      behavior: "smooth",
    });
    await settleAt(viewport, 1);

    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(scrollToMock).toHaveBeenLastCalledWith({
      left: 600,
      behavior: "smooth",
    });
    await settleAt(viewport, 2);

    scrollToMock.mockClear();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(viewport).toHaveFocus();
  });

  it("jumps and commits immediately for reduced-motion keyboard navigation", () => {
    const { viewport } = renderCarousel({ reducedMotion: true });
    const transactions = screen.getByLabelText("Transactions, slide 2 of 3");
    viewport.focus();
    scrollToMock.mockClear();

    fireEvent.keyDown(viewport, { key: "ArrowRight" });

    expect(scrollToMock).toHaveBeenLastCalledWith({
      left: 300,
      behavior: "auto",
    });
    expect(transactions).not.toHaveAttribute("aria-hidden", "true");
    expect(viewport).toHaveAttribute("data-selected-snap", "1");
  });

  it("keeps the transaction dock mathematically linked to slide index one", async () => {
    const { viewport } = renderCarousel();
    await waitFor(() =>
      expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
        x: 300,
        viewportWidth: 300,
        interactive: false,
        moving: false,
      }),
    );

    scrollViewport(viewport, 450);
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: -150,
      viewportWidth: 300,
      interactive: false,
      moving: true,
    });

    await settleAt(viewport, 2);
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: -300,
      viewportWidth: 300,
      interactive: false,
      moving: false,
    });
  });

  it("retains Settings vertical header progress and mounted draft state", async () => {
    const user = userEvent.setup();
    const { headerMotion, viewport } = renderCarousel();
    await settleAt(viewport, 2);
    const settings = screen.getByLabelText("Settings, slide 3 of 3");
    const scroll = screen.getByTestId("settings-scroll");
    const draft = screen.getByRole("textbox", { name: "Settings draft" });
    await user.type(draft, "Travel wallet");
    Object.defineProperty(scroll, "scrollTop", {
      configurable: true,
      writable: true,
      value: 34,
    });
    vi.mocked(headerMotion.setVerticalProgress).mockClear();
    fireEvent.scroll(scroll);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
    expect(settings).toHaveStyle({ "--dashboard-header-space": "34px" });

    await settleAt(viewport, 0);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0);

    await settleAt(viewport, 2);
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
    expect(draft).toHaveValue("Travel wallet");
  });

  it("leaves nested horizontal gesture ownership to marked controls", () => {
    const { headerMotion, viewport } = renderCarousel();
    const locked = screen.getByRole("button", {
      name: "Nested analytics swipe target",
    });
    vi.mocked(headerMotion.setHorizontalPosition).mockClear();
    scrollToMock.mockClear();

    fireEvent.pointerDown(locked, {
      pointerType: "touch",
      clientX: 220,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerType: "touch",
      clientX: 80,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerType: "touch",
      clientX: 80,
      clientY: 94,
    });

    expect(locked).toHaveAttribute("data-home-carousel-swipe-lock", "true");
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(headerMotion.setHorizontalPosition).not.toHaveBeenCalled();
  });

  it("passes offline state to both Analytics and Settings without resyncing", () => {
    const { analyticsSync } = renderCarousel({ status: "offline" });
    expect(analyticsViewCalls.at(-1)?.isOffline).toBe(true);
    expect(settingsViewCalls.at(-1)?.analyticsSync.status).toBe("offline");
    expect(transactionViewCalls.at(-1)?.history).toBe(analyticsSync.history);
    expect(resync).not.toHaveBeenCalled();
  });

  it("keeps the existing no-big-spending Settings prompt behavior", async () => {
    const onToast = vi.fn();
    renderCarousel({ onToast });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Toggle no big spending" }));
    expect(onToast).toHaveBeenCalledWith(
      "Set a big spending cutoff in Settings.",
    );
  });
});
