import { useMemo } from "react";
import { useSession, useWorkspace } from "../app/providers";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import { useOnboarding } from "./useOnboarding";

export type AppPhase =
  | "booting"
  | "needs_auth"
  | "needs_sheet"
  | "needs_accounts"
  | "needs_categories"
  | "ready"
  | "error";

function hasAllCategories(categories: typeof DEFAULT_CATEGORIES): boolean {
  return (
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0
  );
}

export function useAppPhase() {
  const session = useSession();
  const workspace = useWorkspace();
  const { onboarding, isLoading: isOnboardingLoading } = useOnboarding();

  const categories = onboarding.categories ?? DEFAULT_CATEGORIES;
  const accountsReady =
    onboarding.accountsConfirmed && onboarding.accounts.length > 0;
  const categoriesReady =
    onboarding.categoriesConfirmed && hasAllCategories(categories);

  return useMemo(() => {
    const isBooting =
      !session.isInitialized || !workspace.isInitialized || isOnboardingLoading;
    if (isBooting) {
      return {
        phase: "booting" as const,
        accountsReady,
        categoriesReady,
      };
    }

    if (session.status === "error") {
      return {
        phase: "error" as const,
        accountsReady,
        categoriesReady,
        error: session.error,
      };
    }

    if (session.status !== "authenticated" || !session.accessToken) {
      return {
        phase: "needs_auth" as const,
        accountsReady,
        categoriesReady,
      };
    }

    if (!workspace.sheetId) {
      return {
        phase: "needs_sheet" as const,
        accountsReady,
        categoriesReady,
      };
    }

    if (!accountsReady) {
      return {
        phase: "needs_accounts" as const,
        accountsReady,
        categoriesReady,
      };
    }

    if (!categoriesReady) {
      return {
        phase: "needs_categories" as const,
        accountsReady,
        categoriesReady,
      };
    }

    return {
      phase: "ready" as const,
      accountsReady,
      categoriesReady,
    };
  }, [
    session.isInitialized,
    session.status,
    session.accessToken,
    session.error,
    workspace.isInitialized,
    workspace.sheetId,
    isOnboardingLoading,
    accountsReady,
    categoriesReady,
  ]);
}

