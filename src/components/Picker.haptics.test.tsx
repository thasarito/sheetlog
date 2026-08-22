import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Picker } from "./Picker";

const haptics = vi.hoisted(() => ({
  triggerHapticFeedback: vi.fn(),
}));

vi.mock("../lib/transactionHaptics", () => ({
  triggerHapticFeedback: haptics.triggerHapticFeedback,
}));

afterEach(() => {
  haptics.triggerHapticFeedback.mockReset();
});

describe("Picker haptics", () => {
  it("fires selection feedback only when the committed value changes", () => {
    const onChange = vi.fn();
    render(
      <Picker
        value={{ selection: "Cash" }}
        onChange={onChange}
        height={84}
        itemHeight={28}
      >
        <Picker.Column name="selection">
          <Picker.Item value="Cash">Cash</Picker.Item>
          <Picker.Item value="Bank">Bank</Picker.Item>
        </Picker.Column>
      </Picker>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(haptics.triggerHapticFeedback).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Bank" }));
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(1);
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledWith("selection");
    expect(onChange).toHaveBeenCalledWith(
      { selection: "Bank" },
      "selection",
    );
  });
});
