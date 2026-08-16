import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ConnectScreen } from "./ConnectScreen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/privacy">{children}</a>,
}));

describe("ConnectScreen", () => {
  it("shows an actionable Google profile verification error beside re-authentication", () => {
    render(
      <ConnectScreen
        meta={{
          stepLabel: "Connect",
          stepNumber: 1,
          totalSteps: 4,
          progressPercent: 25,
        }}
        isConnecting={false}
        errorMessage="Could not verify this Google account. Sign in again."
        onConnect={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not verify this Google account. Sign in again.",
    );
    expect(
      screen.getByRole("button", { name: /Sign in with Google/ }),
    ).toBeEnabled();
  });
});
