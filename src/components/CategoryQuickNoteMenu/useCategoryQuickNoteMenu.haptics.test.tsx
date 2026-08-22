import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCategoryQuickNoteMenu } from "./useCategoryQuickNoteMenu";

const haptics = vi.hoisted(() => ({
  triggerHapticFeedback: vi.fn(),
}));

vi.mock("../../lib/transactionHaptics", () => ({
  triggerHapticFeedback: haptics.triggerHapticFeedback,
}));

function bounds() {
  return {
    left: 40,
    top: 520,
    right: 120,
    bottom: 600,
    width: 80,
    height: 80,
  };
}

afterEach(() => {
  haptics.triggerHapticFeedback.mockReset();
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.restoreAllMocks();
});

describe("useCategoryQuickNoteMenu haptics", () => {
  it("fires once whenever the drag enters a different actionable target", () => {
    const anchor = document.createElement("button");
    const coffee = document.createElement("button");
    coffee.dataset.categoryQuickNoteSource = "custom";
    coffee.dataset.categoryQuickNoteId = "coffee";
    const lunch = document.createElement("button");
    lunch.dataset.categoryQuickNoteSource = "custom";
    lunch.dataset.categoryQuickNoteId = "lunch";
    const elementFromPoint = vi.fn((): Element | null => coffee);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    const { result } = renderHook(() =>
      useCategoryQuickNoteMenu({
        getCustomNotes: () => [
          { id: "coffee", note: "Coffee" },
          { id: "lunch", note: "Lunch" },
        ],
        getDefaultNotes: () => [],
        getCategoryPresentation: () => ({
          label: "Food",
          icon: "Utensils",
          color: "#f97316",
        }),
        onSelectNote: vi.fn(),
        onUseCategory: vi.fn(),
      }),
    );

    act(() => {
      result.current.handlers.onLongPressStart(
        "Food",
        { x: 80, y: 560 },
        { element: anchor, bounds: bounds() },
      );
      result.current.handlers.onDrag({ x: 180, y: 500 });
    });
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(1);
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("selection");

    act(() => result.current.handlers.onDrag({ x: 182, y: 502 }));
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(1);

    elementFromPoint.mockReturnValue(lunch);
    act(() => result.current.handlers.onDrag({ x: 220, y: 500 }));
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(2);

    elementFromPoint.mockReturnValue(null);
    act(() => result.current.handlers.onDrag({ x: 80, y: 560 }));
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(3);
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("selection");
  });
});
