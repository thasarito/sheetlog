import { describe, expect, it, vi } from "vitest";
import type { SessionContextValue } from "../session/session.types";
import { resolveLocalSession } from "./LocalSessionFallbackProvider";

const upstream: SessionContextValue = {
  accessToken: null,
  userProfile: null,
  isConnecting: false,
  isInitialized: true,
  status: "unauthenticated",
  error: null,
  connect: vi.fn(),
  signOut: vi.fn(),
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

describe("local session fallback", () => {
  it("activates for an unauthenticated user with local workspace metadata", () => {
    expect(resolveLocalSession(upstream, metadata)).toMatchObject({
      status: "local",
      accessToken: null,
      userProfile: { id: metadata.userId },
    });
  });

  it("never overrides an authenticated Google session", () => {
    const authenticated: SessionContextValue = {
      ...upstream,
      status: "authenticated",
      accessToken: "google-token",
      userProfile: {
        id: "google-user",
        name: "Google User",
        picture: null,
      },
    };
    expect(resolveLocalSession(authenticated, metadata)).toBe(authenticated);
  });
});
