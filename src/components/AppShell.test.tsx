import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="route-content">Route content</div>,
  useNavigate: () => vi.fn(),
}));

vi.mock("../app/providers", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../hooks/useOAuthCallback", () => ({
  useOAuthCallback: () => ({ isProcessing: false, error: null }),
}));

vi.mock("./ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("./ReloadPrompt", () => ({
  ReloadPrompt: () => null,
}));

describe("AppShell", () => {
  it("does not clip content that deliberately extends into the bottom safe area", () => {
    render(<AppShell />);

    const shell = screen.getByTestId("app-shell");
    expect(shell).toHaveClass("overflow-visible");
    expect(shell).not.toHaveClass("overflow-hidden");
    expect(screen.getByTestId("route-content")).toBeInTheDocument();
  });
});
