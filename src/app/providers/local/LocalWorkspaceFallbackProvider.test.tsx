import { describe, expect, it, vi } from "vitest";
import type { WorkspaceContextValue } from "../workspace/workspace.types";
import { resolveLocalWorkspace } from "./LocalWorkspaceFallbackProvider";

const upstream: WorkspaceContextValue = {
  sheetId: null,
  sheetTabId: null,
  isInitialized: false,
  ensureSheet: vi.fn(),
  suspendWorkspace: vi.fn(),
  clearWorkspace: vi.fn(),
};

const metadata = {
  version: 1 as const,
  bootstrapId: "bootstrap-1",
  userId: "local-user:bootstrap-1",
  sheetId: "local-workspace:bootstrap-1",
  countryCode: "TH",
  currency: "THB" as const,
  createdAt: "2026-08-26T10:00:00.000Z",
};

describe("local workspace fallback", () => {
  it("publishes the synthetic workspace for a local session", () => {
    expect(resolveLocalWorkspace(upstream, "local", metadata)).toMatchObject({
      sheetId: metadata.sheetId,
      sheetTabId: 0,
      isInitialized: true,
    });
  });

  it("keeps the Google workspace for every other session", () => {
    expect(resolveLocalWorkspace(upstream, "authenticated", metadata)).toBe(
      upstream,
    );
  });
});
