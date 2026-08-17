import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AnimatedTabs } from "./AnimatedTabs";

const tabs = [
  { value: "expense", label: "Expense", icon: ArrowDownRight },
  { value: "income", label: "Income", icon: ArrowUpRight },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
] as const;

describe("AnimatedTabs compact variant", () => {
  it("uses a 52px shadow-free control with 44px pressed buttons", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AnimatedTabs
        tabs={[...tabs]}
        value="expense"
        onChange={onChange}
        layoutId="compact-tabs-test"
        variant="compact"
      />,
    );

    expect(screen.getByTestId("animated-tabs-compact")).toHaveClass(
      "h-[52px]",
    );
    expect(screen.getByRole("button", { name: "Expense" })).toHaveClass(
      "min-h-11",
    );
    expect(screen.getByRole("button", { name: "Expense" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector('[class*="shadow"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(onChange).toHaveBeenCalledWith("income");
  });

  it("moves the compact indicator with visual progress before semantic selection commits", () => {
    render(
      <AnimatedTabs
        tabs={[...tabs]}
        value="expense"
        visualProgress={0.5}
        onChange={vi.fn()}
        layoutId="compact-tabs-progress-test"
        variant="compact"
      />,
    );

    expect(
      screen.getByTestId("animated-tabs-compact-indicator"),
    ).toHaveStyle({ transform: "translateX(calc(50% + 2px))" });
    expect(screen.getByRole("button", { name: "Expense" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Income")).toHaveClass("text-foreground");
    expect(screen.getByText("Expense")).toHaveClass("text-muted-foreground");
  });
});
