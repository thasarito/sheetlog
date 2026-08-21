import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./sonner";

const sonnerMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    sonnerMock.props = props;
    return <div data-testid="sonner-toaster" />;
  },
}));

afterEach(() => {
  sonnerMock.props = null;
});

describe("Toaster iOS safe-area placement", () => {
  it("positions top-center toasts below the Dynamic Island", () => {
    render(<Toaster />);

    expect(sonnerMock.props).toMatchObject({
      position: "top-center",
      offset: {
        top: "calc(env(safe-area-inset-top, 0px) + 24px)",
      },
      mobileOffset: {
        top: "calc(env(safe-area-inset-top, 0px) + 16px)",
        right: 16,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        left: 16,
      },
    });
    expect(String(sonnerMock.props?.className)).not.toContain("top-safe");
  });

  it("preserves caller-provided offsets", () => {
    const offset = { top: 40 };
    const mobileOffset = { top: 48, right: 20, left: 20 };

    render(<Toaster offset={offset} mobileOffset={mobileOffset} />);

    expect(sonnerMock.props?.offset).toBe(offset);
    expect(sonnerMock.props?.mobileOffset).toBe(mobileOffset);
  });
});
