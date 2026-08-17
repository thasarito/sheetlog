import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AnimatedTabs } from "./AnimatedTabs";

const tabs = [
  { value: "expense", label: "Expense", icon: ArrowDownRight },
  { value: "income", label: "Income", icon: ArrowUpRight },
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
});
