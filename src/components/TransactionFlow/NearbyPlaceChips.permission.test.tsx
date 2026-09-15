import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NearbyPlaceChips } from "./NearbyPlaceChips";

describe("NearbyPlaceChips location opt-in", () => {
  it("requests location only after an explicit button click", () => {
    const onRequestLocation = vi.fn();
    const onSelect = vi.fn();
    render(
      <NearbyPlaceChips
        suggestions={[]}
        isLoading={false}
        onSelect={onSelect}
        onRequestLocation={onRequestLocation}
      />,
    );

    expect(onRequestLocation).not.toHaveBeenCalled();
    const button = screen.getByRole("button", {
      name: "Use location for nearby places",
    });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not show an opt-in while a lookup is running", () => {
    render(
      <NearbyPlaceChips
        suggestions={[]}
        isLoading
        onSelect={vi.fn()}
        onRequestLocation={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Use location for nearby places" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the empty state hidden when location cannot be requested", () => {
    const { container } = render(
      <NearbyPlaceChips suggestions={[]} isLoading={false} onSelect={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps existing nearby-place selection independent of location opt-in", () => {
    const suggestion = { placeId: "cafe", name: "Cafe" };
    const onSelect = vi.fn();
    const onRequestLocation = vi.fn();
    render(
      <NearbyPlaceChips
        suggestions={[suggestion]}
        isLoading={false}
        onSelect={onSelect}
        onRequestLocation={onRequestLocation}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Use location for nearby places" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Cafe as note" }));
    expect(onSelect).toHaveBeenCalledWith(suggestion);
    expect(onRequestLocation).not.toHaveBeenCalled();
  });
});
