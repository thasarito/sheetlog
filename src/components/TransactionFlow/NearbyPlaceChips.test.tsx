import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NearbyPlaceChips } from "./NearbyPlaceChips";

describe("NearbyPlaceChips", () => {
  it("renders nothing when not loading and no suggestions exist", () => {
    const { container } = render(
      <NearbyPlaceChips suggestions={[]} isLoading={false} onSelect={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a quiet loading state after 300 ms", async () => {
    vi.useFakeTimers();
    render(<NearbyPlaceChips suggestions={[]} isLoading onSelect={vi.fn()} />);

    expect(screen.queryByText("Finding places")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("Nearby")).toBeInTheDocument();
    expect(screen.getByText("Finding places")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders place chips with attribution", () => {
    render(
      <NearbyPlaceChips
        suggestions={["Starbucks", "7-Eleven"]}
        isLoading={false}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Use Starbucks as note" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use 7-Eleven as note" })
    ).toBeInTheDocument();
    expect(screen.getByText("Powered by Google")).toBeInTheDocument();
  });

  it("calls onSelect when a chip is tapped", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <NearbyPlaceChips
        suggestions={["Terminal 21"]}
        isLoading={false}
        onSelect={onSelect}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use Terminal 21 as note" })
    );

    expect(onSelect).toHaveBeenCalledWith("Terminal 21");
  });
});
