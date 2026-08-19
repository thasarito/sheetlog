import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import type { DashboardHeaderMotionHandle } from "../Header";
import type { SettingsViewProps } from "../SettingsView";
import type { AnalyticsViewProps } from "./AnalyticsView";
import { HomeDashboardCarousel } from "./HomeDashboardCarousel";
import type { TransactionHistoryViewProps } from "./TransactionHistoryView";
import type { AnalyticsSyncController } from "./useAnalyticsSync";

const emblaHarness = vi.hoisted(() => ({
  api: null as null | {
    emit: (name: string) => unknown;
    scrollNext: () => void;
    scrollPrev: () => void;
  },
  slideOffsets: [0, 300, 600] as [number, number, number],
  options: null as null | { loop?: boolean },
}));

vi.mock("embla-carousel-react", async () => {
  const React = await import("react");
  return {
    default: function useFakeEmbla(options: { loop?: boolean }) {
      emblaHarness.options = options;
      const [viewport, setViewport] = React.useState<HTMLElement | null>(null);
      const api = React.useMemo(() => {
        const listeners = new Map<string, Set<(api: unknown) => void>>();
        let selected = 0;
        let root: HTMLElement | null = null;
        const emit = (name: string) => {
          for (const listener of listeners.get(name) ?? []) listener(fakeApi);
        };
        const select = (next: number) => {
          const bounded = Math.max(0, Math.min(2, next));
          if (bounded === selected) return;
          selected = bounded;
          emblaHarness.slideOffsets =
            selected === 0
              ? [0, 300, 600]
              : selected === 1
                ? [-300, 0, 300]
                : [-600, -300, 0];
          emit("scroll");
          emit("select");
          emit("settle");
        };
        const fakeApi = {
          canScrollNext: () => selected < 2,
          canScrollPrev: () => selected > 0,
          containerNode: () => root?.firstElementChild as HTMLElement,
          destroy: () => undefined,
          emit(name: string) {
            emit(name);
            return fakeApi;
          },
          internalEngine: () => ({}),
          off(name: string, listener: (api: unknown) => void) {
            listeners.get(name)?.delete(listener);
            return fakeApi;
          },
          on(name: string, listener: (api: unknown) => void) {
            const callbacks = listeners.get(name) ?? new Set();
            callbacks.add(listener);
            listeners.set(name, callbacks);
            return fakeApi;
          },
          plugins: () => ({}),
          previousScrollSnap: () => Math.max(0, selected - 1),
          reInit: () => emit("reInit"),
          rootNode: () => root as HTMLElement,
          scrollNext: () => select(selected + 1),
          scrollPrev: () => select(selected - 1),
          scrollProgress: () => selected,
          scrollSnapList: () => [0, 1, 2],
          scrollTo: (index: number) => select(index),
          selectedScrollSnap: () => selected,
          slideNodes: () =>
            Array.from(
              root?.querySelectorAll<HTMLElement>(
                "[data-home-carousel-slide-index]",
              ) ?? [],
            ),
          slidesInView: () => [selected],
          slidesNotInView: () =>
            [0, 1, 2].filter((index) => index !== selected),
          setRoot(nextRoot: HTMLElement) {
            root = nextRoot;
          },
        };
        return fakeApi;
      }, []);
      React.useEffect(() => {
        if (!viewport) return;
        api.setRoot(viewport);
        emblaHarness.api = api;
        return () => {
          if (emblaHarness.api === api) emblaHarness.api = null;
        };
      }, [api, viewport]);
      return [setViewport, viewport ? api : undefined] as const;
    },
  };
});

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
      <section data-testid="transaction-history-scroll" data-dashboard-scroll="true">
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

function renderCarousel({
  status = "synced",
  onToast = vi.fn(),
}: {
  status?: AnalyticsSyncController["status"];
  onToast?: (message: string) => void;
} = {}) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function mockRect(this: HTMLElement) {
      const viewportLeft = 40;
      const slideIndex = Number(this.dataset.homeCarouselSlideIndex);
      const left = Number.isInteger(slideIndex)
        ? viewportLeft + emblaHarness.slideOffsets[slideIndex]
        : this.dataset.testid === "home-carousel-viewport"
          ? viewportLeft
          : 0;
      const width =
        Number.isInteger(slideIndex) ||
        this.dataset.testid === "home-carousel-viewport"
          ? 300
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

async function openSettings() {
  const viewport = screen.getByTestId("home-carousel-viewport");
  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByLabelText("Settings, slide 3 of 3")).not.toHaveAttribute(
      "aria-hidden",
      "true",
    ),
  );
}

function touchDrag(
  viewport: HTMLElement,
  target: HTMLElement,
  startX: number,
  endX: number,
) {
  fireEvent.pointerDown(target, {
    pointerType: "touch",
    clientX: startX,
    clientY: 90,
  });
  fireEvent.pointerMove(viewport, {
    pointerType: "touch",
    clientX: endX,
    clientY: 94,
  });
  fireEvent.pointerUp(viewport, {
    pointerType: "touch",
    clientX: endX,
    clientY: 94,
  });
  if (!target.closest('[data-home-carousel-swipe-lock="true"]')) {
    act(() => {
      if (endX < startX) emblaHarness.api?.scrollNext();
      else emblaHarness.api?.scrollPrev();
    });
  }
}

describe("HomeDashboardCarousel", () => {
  beforeEach(() => {
    analyticsViewCalls.splice(0);
    transactionViewCalls.splice(0);
    settingsViewCalls.splice(0);
    emblaHarness.slideOffsets = [0, 300, 600];
    emblaHarness.options = null;
    vi.mocked(dockMotion.setMotion).mockReset();
    resync.mockReset();
  });

  it("renders the exact bounded order and exposes only Analytics initially", async () => {
    const { analyticsSync } = renderCarousel();
    const analytics = screen.getByLabelText("Analytics, slide 1 of 3");
    const transactions = screen.getByLabelText("Transactions, slide 2 of 3");
    const settings = screen.getByLabelText("Settings, slide 3 of 3");

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
    expect(emblaHarness.options?.loop).toBe(false);
  });

  it("moves within bounded ends with Left and Right Arrow without moving focus", async () => {
    const { headerMotion, viewport } = renderCarousel();
    const analytics = screen.getByLabelText("Analytics, slide 1 of 3");
    const transactions = screen.getByLabelText("Transactions, slide 2 of 3");
    const settings = screen.getByLabelText("Settings, slide 3 of 3");

    viewport.focus();
    vi.mocked(headerMotion.setHorizontalMotion).mockClear();
    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    expect(analytics).not.toHaveAttribute("aria-hidden", "true");
    expect(headerMotion.setHorizontalMotion).not.toHaveBeenCalled();
    expect(viewport).toHaveFocus();

    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await waitFor(() =>
      expect(transactions).not.toHaveAttribute("aria-hidden", "true"),
    );
    expect(headerMotion.syncHorizontalSelection).toHaveBeenLastCalledWith(
      "Transactions",
    );

    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await waitFor(() =>
      expect(settings).not.toHaveAttribute("aria-hidden", "true"),
    );
    expect(headerMotion.syncHorizontalSelection).toHaveBeenLastCalledWith(
      "Settings",
    );

    vi.mocked(headerMotion.setHorizontalMotion).mockClear();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(settings).not.toHaveAttribute("aria-hidden", "true");
    expect(headerMotion.setHorizontalMotion).not.toHaveBeenCalled();

    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(transactions).not.toHaveAttribute("aria-hidden", "true"),
    );
    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(analytics).not.toHaveAttribute("aria-hidden", "true"),
    );
  });

  it("keeps the transaction dock associated with slide index 1", async () => {
    renderCarousel();
    await waitFor(() =>
      expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
        x: 300,
        viewportWidth: 300,
        interactive: false,
        moving: false,
      }),
    );

    fireEvent.keyDown(screen.getByTestId("home-carousel-viewport"), {
      key: "ArrowRight",
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText("Transactions, slide 2 of 3"),
      ).not.toHaveAttribute("aria-hidden", "true"),
    );
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: 0,
      viewportWidth: 300,
      interactive: true,
      moving: false,
    });

    fireEvent.keyDown(screen.getByTestId("home-carousel-viewport"), {
      key: "ArrowRight",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Settings, slide 3 of 3")).not.toHaveAttribute(
        "aria-hidden",
        "true",
      ),
    );
    expect(dockMotion.setMotion).toHaveBeenLastCalledWith({
      x: -300,
      viewportWidth: 300,
      interactive: false,
      moving: false,
    });
  });

  it("retains Settings vertical header progress and mounted draft state across slide changes", async () => {
    const user = userEvent.setup();
    const { headerMotion, viewport } = renderCarousel();
    await openSettings();
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

    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(
        screen.getByLabelText("Analytics, slide 1 of 3"),
      ).not.toHaveAttribute("aria-hidden", "true"),
    );
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await waitFor(() =>
      expect(settings).not.toHaveAttribute("aria-hidden", "true"),
    );
    expect(headerMotion.setVerticalProgress).toHaveBeenLastCalledWith(0.5);
    expect(draft).toHaveValue("Travel wallet");
  });

  it("moves with ordinary touch gestures, resists edge gestures, and isolates nested Settings gestures", async () => {
    const { headerMotion, viewport } = renderCarousel();

    vi.mocked(headerMotion.setHorizontalMotion).mockClear();
    touchDrag(viewport, viewport, 100, 260);
    expect(
      screen.getByLabelText("Analytics, slide 1 of 3"),
    ).not.toHaveAttribute("aria-hidden", "true");
    expect(headerMotion.setHorizontalMotion).not.toHaveBeenCalled();

    touchDrag(viewport, viewport, 260, 100);
    await waitFor(() =>
      expect(
        screen.getByLabelText("Transactions, slide 2 of 3"),
      ).not.toHaveAttribute("aria-hidden", "true"),
    );
    touchDrag(viewport, viewport, 100, 260);
    await waitFor(() =>
      expect(
        screen.getByLabelText("Analytics, slide 1 of 3"),
      ).not.toHaveAttribute("aria-hidden", "true"),
    );

    await openSettings();
    vi.mocked(headerMotion.setHorizontalMotion).mockClear();
    touchDrag(viewport, viewport, 260, 100);
    expect(
      screen.getByLabelText("Settings, slide 3 of 3"),
    ).not.toHaveAttribute("aria-hidden", "true");
    expect(headerMotion.setHorizontalMotion).not.toHaveBeenCalled();

    const locked = screen.getByRole("button", {
      name: "Settings-owned swipe target",
    });
    touchDrag(viewport, locked, 100, 260);
    expect(
      screen.getByLabelText("Settings, slide 3 of 3"),
    ).not.toHaveAttribute("aria-hidden", "true");
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
