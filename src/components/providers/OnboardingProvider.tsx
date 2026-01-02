"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { OnboardingState } from "../../lib/types";
import {
  getDefaultOnboardingState,
  getOnboardingState,
} from "../../lib/settings";
import {
  hydrateOnboardingFromSheet,
  updateOnboarding as persistOnboarding,
} from "../../lib/onboarding";
import { isGoogleAuthError } from "../../lib/googleErrors";
import { useAuthStorage } from "./AuthStorageProvider";
import { useConnectivity } from "./ConnectivityProvider";

type OnboardingStore = {
  onboarding: OnboardingState;
  hasLoaded: boolean;
};

type OnboardingAction =
  | { type: "load"; onboarding: OnboardingState }
  | { type: "update"; onboarding: OnboardingState };

function onboardingReducer(
  state: OnboardingStore,
  action: OnboardingAction
): OnboardingStore {
  switch (action.type) {
    case "load":
      return { onboarding: action.onboarding, hasLoaded: true };
    case "update":
      return { ...state, onboarding: action.onboarding };
    default:
      return state;
  }
}

interface OnboardingContextValue {
  onboarding: OnboardingState;
  updateOnboarding: (
    updates: Partial<OnboardingState>
  ) => Promise<OnboardingState>;
  refreshOnboarding: () => Promise<boolean>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accessToken, sheetId, clearAuth } = useAuthStorage();
  const { isOnline } = useConnectivity();
  const [store, dispatch] = useReducer(onboardingReducer, undefined, () => ({
    onboarding: getDefaultOnboardingState(),
    hasLoaded: false,
  }));
  const onboardingRef = useRef(store.onboarding);

  useEffect(() => {
    onboardingRef.current = store.onboarding;
  }, [store.onboarding]);

  useEffect(() => {
    let cancelled = false;
    async function loadStored() {
      const stored = await getOnboardingState();
      if (!cancelled) {
        dispatch({ type: "load", onboarding: stored });
      }
    }
    void loadStored();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!store.hasLoaded || !accessToken || !sheetId || !isOnline) {
      return;
    }
    const token = accessToken;
    const sheet = sheetId;
    let cancelled = false;
    async function hydrate() {
      try {
        const merged = await hydrateOnboardingFromSheet(
          token,
          sheet,
          onboardingRef.current
        );
        if (!cancelled && merged.changed) {
          dispatch({ type: "update", onboarding: merged.next });
        }
      } catch (error) {
        console.error("Onboarding hydration error:", error);
        if (
          isGoogleAuthError(error) ||
          (error instanceof Error && error.message.includes("401")) ||
          (error instanceof Error && error.message.includes("Unauthorized"))
        ) {
          clearAuth();
        }
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [store.hasLoaded, accessToken, sheetId, isOnline, clearAuth]);

  const updateOnboarding = useCallback(
    async (updates: Partial<OnboardingState>) => {
      try {
        const nextState = await persistOnboarding({
          current: onboardingRef.current,
          updates,
          accessToken,
          sheetId,
          isOnline,
        });
        dispatch({ type: "update", onboarding: nextState });
        return nextState;
      } catch (error) {
        if (isGoogleAuthError(error)) {
          clearAuth();
        }
        throw error;
      }
    },
    [accessToken, sheetId, isOnline, clearAuth]
  );

  const refreshOnboarding = useCallback(async (): Promise<boolean> => {
    if (!accessToken || !sheetId) {
      throw new Error("Connect to sync accounts and categories");
    }
    if (!isOnline) {
      throw new Error("Go online to sync accounts and categories");
    }
    try {
      const merged = await hydrateOnboardingFromSheet(
        accessToken,
        sheetId,
        onboardingRef.current,
        { force: true }
      );
      if (merged.changed) {
        dispatch({ type: "update", onboarding: merged.next });
      }
      return merged.changed;
    } catch (error) {
      if (isGoogleAuthError(error)) {
        clearAuth();
      }
      throw error;
    }
  }, [accessToken, sheetId, isOnline, clearAuth]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      onboarding: store.onboarding,
      updateOnboarding,
      refreshOnboarding,
    }),
    [store.onboarding, updateOnboarding, refreshOnboarding]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
