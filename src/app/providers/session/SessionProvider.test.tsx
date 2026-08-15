import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../../lib/constants";
import { useSession } from "./session.hooks";
import { SessionProvider } from "./SessionProvider";

function ProfileSubject() {
  const { userProfile } = useSession();
  return <output>{userProfile?.id ?? "waiting"}</output>;
}

describe("SessionProvider account identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "access-token");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("stores the stable Google subject from userinfo in the session profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: "google-subject-123",
          name: "Test User",
          picture: "https://example.test/avatar.png",
        }),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ProfileSubject />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("google-subject-123")).toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE) ?? "null",
      ),
    ).toMatchObject({ id: "google-subject-123", name: "Test User" });
  });
});
