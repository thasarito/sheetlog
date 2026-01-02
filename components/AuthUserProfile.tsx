"use client";

import { useEffect, useState } from "react";
import { useAuthStorage } from "./providers";

const ACCESS_TOKEN_KEY = "sheetlog.accessToken";
const USER_PROFILE_KEY = "sheetlog.userProfile";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

type UserProfile = {
  name: string;
  picture: string | null;
};

type UserInfoResponse = {
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

function readStoredProfile(): UserProfile | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(USER_PROFILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function persistProfile(profile: UserProfile | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!profile) {
    localStorage.removeItem(USER_PROFILE_KEY);
    return;
  }
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

function resolveProfileName(info: UserInfoResponse) {
  const direct = info.name?.trim();
  if (direct) {
    return direct;
  }
  const combined = [info.given_name, info.family_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return combined || "Google account";
}

async function fetchUserProfile(
  accessToken: string,
  signal: AbortSignal
): Promise<UserProfile | null> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load user profile: ${response.status}`);
  }
  const data = (await response.json()) as UserInfoResponse;
  if (!data.name && !data.given_name && !data.family_name && !data.picture) {
    return null;
  }
  return {
    name: resolveProfileName(data),
    picture: data.picture ?? null,
  };
}

export function AuthUserProfile() {
  const { accessToken } = useAuthStorage();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!accessToken) {
      const storedToken =
        typeof window === "undefined"
          ? null
          : localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!storedToken) {
        setProfile(null);
        persistProfile(null);
        return;
      }
      const cached = readStoredProfile();
      if (cached) {
        setProfile(cached);
      }
      return;
    }

    const cached = readStoredProfile();
    if (cached) {
      setProfile(cached);
    }

    const controller = new AbortController();
    fetchUserProfile(accessToken, controller.signal)
      .then((nextProfile) => {
        if (!nextProfile) {
          return;
        }
        setProfile(nextProfile);
        persistProfile(nextProfile);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      });

    return () => controller.abort();
  }, [accessToken]);

  if (!accessToken || !profile) {
    return null;
  }

  const fallbackInitial = profile.name.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="flex max-w-md mx-auto items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2">
        {profile.picture ? (
          <img
            alt={`${profile.name} profile`}
            className="h-full w-full object-cover"
            src={profile.picture}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {fallbackInitial}
          </span>
        )}
      </div>
      <span className="max-w-[140px] truncate">{profile.name}</span>
    </div>
  );
}
