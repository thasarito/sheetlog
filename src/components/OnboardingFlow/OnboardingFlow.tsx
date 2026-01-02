import "@khmyznikov/pwa-install";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download } from "lucide-react";
import { useAuthStorage, useConnectivity, useOnboarding } from "../providers";
import { StatusDot } from "../StatusDot";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import type { TransactionType } from "../../lib/types";
import { AccountsScreen } from "./AccountsScreen";
import { CategoriesScreen } from "./CategoriesScreen";
import { ConnectScreen } from "./ConnectScreen";
import { DoneScreen } from "./DoneScreen";
import { SheetLocationScreen } from "./SheetLocationScreen";
import type { CategoryInputs, LocationMode, ScreenMeta } from "./types";

type PWAInstallElement = HTMLElement & {
  showDialog: (open?: boolean) => void;
  hideDialog: () => void;
  install: () => void;
  isInstallAvailable?: boolean;
  isAppleMobilePlatform?: boolean;
  isAppleDesktopPlatform?: boolean;
  isUnderStandaloneMode?: boolean;
};

const PWA_DISMISS_KEY = "sheetlog:pwa-install-dismissed";

interface OnboardingFlowProps {
  onToast: (message: string) => void;
}

export function OnboardingFlow({ onToast }: OnboardingFlowProps) {
  const { isOnline } = useConnectivity();
  const { accessToken, sheetId, isConnecting, connect, refreshSheet } =
    useAuthStorage();
  const { onboarding, updateOnboarding } = useOnboarding();
  const [locationMode, setLocationMode] = useState<LocationMode>(
    onboarding.sheetFolderId ? "folder" : "root"
  );
  const [folderIdInput, setFolderIdInput] = useState(
    onboarding.sheetFolderId ?? ""
  );
  const [accountInput, setAccountInput] = useState("");
  const [categoryInputs, setCategoryInputs] = useState<CategoryInputs>({
    expense: "",
    income: "",
    transfer: "",
  });
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pwaInstallRef = useRef<PWAInstallElement | null>(null);
  const [isPwaInstallAvailable, setIsPwaInstallAvailable] = useState(false);
  const [isPwaPromptOpen, setIsPwaPromptOpen] = useState(false);
  const [hasDismissedPwaPrompt, setHasDismissedPwaPrompt] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const categories = onboarding.categories ?? DEFAULT_CATEGORIES;
  const hasCategories =
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0;
  const accountsReady =
    onboarding.accountsConfirmed && onboarding.accounts.length > 0;
  const categoriesReady = onboarding.categoriesConfirmed && hasCategories;
  const stepIndex = !accessToken
    ? 0
    : !sheetId
    ? 1
    : !accountsReady
    ? 2
    : !categoriesReady
    ? 3
    : 4;

  useEffect(() => {
    if (onboarding.sheetFolderId) {
      setLocationMode("folder");
      setFolderIdInput(onboarding.sheetFolderId);
    }
  }, [onboarding.sheetFolderId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(PWA_DISMISS_KEY);
    if (stored === "true") {
      setHasDismissedPwaPrompt(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => {
      const isStandalone =
        mediaQuery.matches ||
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true;
      setIsStandaloneMode(isStandalone);
    };
    updateStandalone();
    mediaQuery.addEventListener("change", updateStandalone);
    return () => mediaQuery.removeEventListener("change", updateStandalone);
  }, []);

  const updatePwaAvailability = useCallback(() => {
    const element = pwaInstallRef.current;
    if (!element) {
      return;
    }
    const available =
      Boolean(element.isInstallAvailable) ||
      Boolean(element.isAppleMobilePlatform) ||
      Boolean(element.isAppleDesktopPlatform);
    if (element.isUnderStandaloneMode) {
      setIsStandaloneMode(true);
    }
    setIsPwaInstallAvailable(available);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const element = document.getElementById(
      "pwa-install"
    ) as PWAInstallElement | null;
    if (!element) {
      return;
    }
    pwaInstallRef.current = element;
    const handleAvailable = () => updatePwaAvailability();
    const handleInstalled = () => {
      setIsPwaPromptOpen(false);
      setHasDismissedPwaPrompt(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PWA_DISMISS_KEY, "true");
      }
    };
    const frame = window.requestAnimationFrame(updatePwaAvailability);
    element.addEventListener("pwa-install-available-event", handleAvailable);
    element.addEventListener("pwa-install-success-event", handleInstalled);
    element.addEventListener("pwa-user-choice-result-event", handleInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener(
        "pwa-install-available-event",
        handleAvailable
      );
      element.removeEventListener("pwa-install-success-event", handleInstalled);
      element.removeEventListener(
        "pwa-user-choice-result-event",
        handleInstalled
      );
    };
  }, [updatePwaAvailability]);

  useEffect(() => {
    if (
      stepIndex !== 4 ||
      isStandaloneMode ||
      hasDismissedPwaPrompt ||
      !isPwaInstallAvailable
    ) {
      setIsPwaPromptOpen(false);
      return;
    }
    setIsPwaPromptOpen(true);
  }, [
    stepIndex,
    hasDismissedPwaPrompt,
    isPwaInstallAvailable,
    isStandaloneMode,
  ]);

  const dismissPwaPrompt = useCallback(() => {
    setIsPwaPromptOpen(false);
    setHasDismissedPwaPrompt(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PWA_DISMISS_KEY, "true");
    }
  }, []);

  const handlePwaInstall = useCallback(() => {
    dismissPwaPrompt();
    pwaInstallRef.current?.showDialog(true);
  }, [dismissPwaPrompt]);

  const steps = useMemo(
    () => [
      { label: "Connect", done: Boolean(accessToken) },
      { label: "Sheet", done: Boolean(sheetId) },
      { label: "Accounts", done: accountsReady },
      { label: "Categories", done: categoriesReady },
    ],
    [accessToken, sheetId, accountsReady, categoriesReady]
  );
  const totalSteps = steps.length;
  const isComplete = stepIndex >= totalSteps;
  const activeStepIndex = Math.min(stepIndex, totalSteps - 1);
  const currentStepNumber = Math.min(stepIndex + 1, totalSteps);
  const progressPercent = Math.round((currentStepNumber / totalSteps) * 100);
  const activeStepLabel = isComplete
    ? "Complete"
    : steps[activeStepIndex]?.label ?? "Complete";
  const screenMeta: ScreenMeta = {
    stepLabel: activeStepLabel,
    stepNumber: currentStepNumber,
    totalSteps,
    progressPercent,
  };

  async function handleConnect() {
    try {
      await connect();
      onToast("Connected to Google");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Failed to connect");
    }
  }

  async function handleSheetSetup() {
    if (locationMode === "folder" && !folderIdInput.trim()) {
      onToast("Enter a Drive folder ID");
      return;
    }
    const folderId = locationMode === "folder" ? folderIdInput.trim() : null;
    setIsSettingUpSheet(true);
    try {
      await refreshSheet(folderId);
      await updateOnboarding({ sheetFolderId: folderId });
      onToast("Sheet ready");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Failed to set up sheet"
      );
    } finally {
      setIsSettingUpSheet(false);
    }
  }

  async function addAccount() {
    const nextValue = accountInput.trim();
    if (!nextValue) {
      onToast("Enter an account name");
      return;
    }
    const exists = onboarding.accounts.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast("Account already added");
      return;
    }
    try {
      await updateOnboarding({
        accounts: [...onboarding.accounts, nextValue],
      });
      setAccountInput("");
    } catch {
      onToast("Failed to add account");
    }
  }

  async function removeAccount(name: string) {
    const next = onboarding.accounts.filter((item) => item !== name);
    try {
      await updateOnboarding({ accounts: next });
    } catch {
      onToast("Failed to remove account");
    }
  }

  async function confirmAccounts() {
    if (onboarding.accounts.length === 0) {
      onToast("Add at least one account");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({ accountsConfirmed: true });
    } catch (error) {
      onToast("Failed to save accounts to sheet");
    } finally {
      setIsSaving(false);
    }
  }

  async function addCategory(type: TransactionType) {
    const nextValue = categoryInputs[type].trim();
    if (!nextValue) {
      onToast("Enter a category");
      return;
    }
    const current = categories[type] ?? [];
    const exists = current.some(
      (item) => item.toLowerCase() === nextValue.toLowerCase()
    );
    if (exists) {
      onToast("Category already added");
      return;
    }
    const next = { ...categories, [type]: [...current, nextValue] };
    try {
      await updateOnboarding({ categories: next });
      setCategoryInputs((prev) => ({ ...prev, [type]: "" }));
    } catch {
      onToast("Failed to add category");
    }
  }

  async function removeCategory(type: TransactionType, name: string) {
    const current = categories[type] ?? [];
    const next = {
      ...categories,
      [type]: current.filter((item) => item !== name),
    };
    try {
      await updateOnboarding({ categories: next });
    } catch {
      onToast("Failed to remove category");
    }
  }

  async function confirmCategories() {
    if (!hasCategories) {
      onToast("Add at least one category per type");
      return;
    }
    setIsSaving(true);
    try {
      await updateOnboarding({ categoriesConfirmed: true });
    } catch (error) {
      onToast("Failed to save categories to sheet");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col gap-6 pb-8 pt-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 left-6 h-40 w-40 rounded-full bg-accent/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-6 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative z-10 flex flex-col gap-6">
        <pwa-install
          id="pwa-install"
          manifest-url="/manifest.webmanifest"
          manual-apple="true"
          manual-chrome="true"
        />
        <header className="space-y-4">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                SheetLog
              </p>
              <h1 className="text-2xl font-semibold">Getting started</h1>
              <p className="text-sm text-muted-foreground">
                Connect Google, choose a sheet home, then personalize accounts
                and categories.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-soft">
              <StatusDot online={isOnline} />
              <span>{isOnline ? "Online" : "Offline"}</span>
            </div>
          </div>
        </header>

        <section className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden rounded-[32px] border border-border/40 bg-card/50 shadow-soft sm:block sm:translate-x-2 sm:translate-y-2"
          />
          <AnimatePresence mode="wait">
            {stepIndex === 0 ? (
              <motion.div
                key="step-auth"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 w-full"
              >
                <ConnectScreen
                  meta={screenMeta}
                  isConnecting={isConnecting}
                  onConnect={handleConnect}
                />
              </motion.div>
            ) : null}

            {stepIndex === 1 ? (
              <motion.div
                key="step-sheet"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 w-full"
              >
                <SheetLocationScreen
                  meta={screenMeta}
                  locationMode={locationMode}
                  folderIdInput={folderIdInput}
                  isSettingUpSheet={isSettingUpSheet}
                  onLocationModeChange={setLocationMode}
                  onFolderIdChange={setFolderIdInput}
                  onSubmit={handleSheetSetup}
                />
              </motion.div>
            ) : null}

            {stepIndex === 2 ? (
              <motion.div
                key="step-accounts"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 w-full"
              >
                <AccountsScreen
                  meta={screenMeta}
                  accountInput={accountInput}
                  accounts={onboarding.accounts}
                  isSaving={isSaving}
                  onAccountInputChange={setAccountInput}
                  onAddAccount={addAccount}
                  onRemoveAccount={removeAccount}
                  onContinue={confirmAccounts}
                />
              </motion.div>
            ) : null}

            {stepIndex === 3 ? (
              <motion.div
                key="step-categories"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 w-full"
              >
                <CategoriesScreen
                  meta={screenMeta}
                  categories={categories}
                  categoryInputs={categoryInputs}
                  isSaving={isSaving}
                  onCategoryInputChange={(type, value) =>
                    setCategoryInputs((prev) => ({
                      ...prev,
                      [type]: value,
                    }))
                  }
                  onAddCategory={addCategory}
                  onRemoveCategory={removeCategory}
                  onFinish={confirmCategories}
                />
              </motion.div>
            ) : null}

            {stepIndex === 4 ? (
              <motion.div
                key="step-done"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 w-full"
              >
                <DoneScreen meta={screenMeta} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      </div>

      <AnimatePresence>
        {isPwaPromptOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/60 p-4 backdrop-blur sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm space-y-4 rounded-[28px] border border-border/70 bg-card/90 px-6 py-5 shadow-lift backdrop-blur pb-safe"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary/15 p-3 text-primary">
                  <Download className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">Install SheetLog</h3>
                  <p className="text-sm text-muted-foreground">
                    Save it to your home screen for faster access and offline
                    logging.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="flex-1 rounded-2xl bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
                  onClick={handlePwaInstall}
                >
                  Install app
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-border bg-surface-2 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
                  onClick={dismissPwaPrompt}
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
