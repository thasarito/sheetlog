import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildPlaceUpdatePatch,
  clearTransactionNote,
  replaceTransactionNote,
  selectGooglePlace,
  setManualTransactionNote,
} from "./transactionNoteForm";
import { useTransactionForm } from "./useTransactionForm";

describe("transaction note form helpers", () => {
  it("retains place for nonblank manual edits and clears it for blank edits", () => {
    const { result } = renderHook(() =>
      useTransactionForm({
        initialValues: {
          note: "Central Cafe",
          place: { provider: "google", placeId: "central-cafe" },
        },
      }),
    );

    act(() => setManualTransactionNote(result.current, "Edited Cafe"));
    expect(result.current.state.values).toMatchObject({
      note: "Edited Cafe",
      place: { provider: "google", placeId: "central-cafe" },
    });

    act(() => setManualTransactionNote(result.current, "   "));
    expect(result.current.state.values.note).toBe("   ");
    expect(result.current.state.values.place).toBeUndefined();
  });

  it("selects and clears note/place atomically", () => {
    const { result } = renderHook(() => useTransactionForm());

    act(() =>
      selectGooglePlace(result.current, {
        displayName: "Central Cafe",
        placeId: " central-cafe ",
      }),
    );
    expect(result.current.state.values).toMatchObject({
      note: "Central Cafe",
      place: { provider: "google", placeId: "central-cafe" },
    });

    act(() => clearTransactionNote(result.current));
    expect(result.current.state.values.note).toBe("");
    expect(result.current.state.values.place).toBeUndefined();
  });

  it("clears place for a programmatic free-text replacement", () => {
    const { result } = renderHook(() =>
      useTransactionForm({
        initialValues: {
          note: "Central Cafe",
          place: { provider: "google", placeId: "central-cafe" },
        },
      }),
    );

    act(() => replaceTransactionNote(result.current, "Quick lunch"));

    expect(result.current.state.values.note).toBe("Quick lunch");
    expect(result.current.state.values.place).toBeUndefined();
  });

  it("omits equal place updates", () => {
    expect(
      buildPlaceUpdatePatch(
        { provider: "google", placeId: "central-cafe" },
        { provider: "google", placeId: "central-cafe" },
      ),
    ).toEqual({});
  });

  it("sets a replacement place", () => {
    expect(
      buildPlaceUpdatePatch(
        { provider: "google", placeId: "central-cafe" },
        { provider: "google", placeId: "north-cafe" },
      ),
    ).toEqual({
      place: { provider: "google", placeId: "north-cafe" },
    });
  });

  it("encodes place removal as an explicit clear", () => {
    expect(
      buildPlaceUpdatePatch(
        { provider: "google", placeId: "central-cafe" },
        undefined,
      ),
    ).toEqual({ place: null });
  });
});
