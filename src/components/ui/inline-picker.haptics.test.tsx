import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlinePicker } from "./inline-picker";

const haptics = vi.hoisted(() => ({
  triggerHapticFeedback: vi.fn(),
}));

vi.mock("../../lib/transactionHaptics", () => ({
  triggerHapticFeedback: haptics.triggerHapticFeedback,
}));

afterEach(() => {
  haptics.triggerHapticFeedback.mockReset();
});

describe("InlinePicker haptics", () => {
  it("fires selection feedback only when the committed value changes", () => {
    const onChange = vi.fn();
    render(
      <InlinePicker
        label="Account"
        value="Cash"
        options={["Cash", "Bank"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(haptics.triggerHapticFeedback).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Bank" }));
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(1);
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledWith("selection");
    expect(onChange).toHaveBeenCalledWith("Bank");
  });
});
