import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useSession } from "../app/providers";
import { OnboardingFlow } from "../components/OnboardingFlow";
import { SheetlogAppPicker } from "../components/SheetlogAppPicker";
import {
  ImportedReceipt,
  TinyWinActivation,
} from "../components/TinyWinOnboarding";
import { TransactionFlow } from "../components/TransactionFlow";
import { useAppPhase } from "../hooks/useAppPhase";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import {
  useSelectedAppQuery,
  useSetSelectedApp,
} from "../hooks/useSelectedAppQuery";
import {
  detectBankCountry,
  getCountryCatalog,
} from "../lib/bankCatalog";
import { consumeBootstrap } from "../lib/bootstrapClient";
import {
  clearImportedBootstrapReceipt,
  importBootstrapPayload,
  type ImportedBootstrapReceipt as ImportedBootstrapReceiptValue,
  readImportedBootstrapReceipt,
} from "../lib/bootstrapImport";
import type { BootstrapPayload } from "../lib/bootstrapPayload";
import type { Currency } from "../lib/currencies";
import { isStandaloneMode } from "../lib/pwa";
import { getSheetlogApp } from "../lib/sheetlogApps";

type StandaloneBootstrapStatus =
  | "idle"
  | "checking"
  | "missing"
  | "error";

type StandaloneBootstrapResult = "imported" | "missing";

function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function detectTinyWinDefaults(): {
  countryCode: string;
  currency: Currency;
} {
  const languages =
    typeof navigator === "undefined"
      ? ["th-TH"]
      : navigator.languages?.length
        ? [...navigator.languages]
        : [navigator.language || "th-TH"];
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = null;
  }
  const countryCode = detectBankCountry(languages, timezone);
  const catalog = getCountryCatalog(countryCode);
  return {
    countryCode: catalog.code,
    currency: catalog.currency as Currency,
  };
}

export function HomePage() {
  const { phase } = useAppPhase();
  const session = useSession();
  const standalone = useMemo(isStandaloneMode, []);
  const tinyWinDefaults = useMemo(detectTinyWinDefaults, []);
  const onToast = useCallback((message: string) => {
    toast(message);
  }, []);
  const [standaloneBootstrapStatus, setStandaloneBootstrapStatus] =
    useState<StandaloneBootstrapStatus>(() =>
      standalone ? "checking" : "idle",
    );
  const [standaloneBootstrapError, setStandaloneBootstrapError] = useState<
    string | null
  >(null);
  const standaloneBootstrapPromiseRef = useRef<
    Promise<StandaloneBootstrapResult> | null
  >(null);
  const consumedStandaloneBootstrapRef = useRef<BootstrapPayload | null>(null);
  const [importedReceipt, setImportedReceipt] =
    useState<ImportedBootstrapReceiptValue | null>(null);
  const [hasLoadedImportedReceipt, setHasLoadedImportedReceipt] =
    useState(false);

  const { data: selectedAppId, isLoading: isSelectedAppLoading } =
    useSelectedAppQuery();
  const setSelectedApp = useSetSelectedApp();
  const resolvedSelectedAppId = selectedAppId ?? null;
  const selectedApp = useMemo(
    () =>
      resolvedSelectedAppId
        ? getSheetlogApp(resolvedSelectedAppId)
        : null,
    [resolvedSelectedAppId],
  );

  useEffect(() => {
    if (
      !standalone ||
      phase !== "needs_auth" ||
      standaloneBootstrapStatus !== "checking"
    ) {
      return;
    }
    setStandaloneBootstrapError(null);

    if (!standaloneBootstrapPromiseRef.current) {
      standaloneBootstrapPromiseRef.current = (async () => {
        const payload =
          consumedStandaloneBootstrapRef.current ??
          (await consumeBootstrap());
        if (!payload) return "missing" as const;
        consumedStandaloneBootstrapRef.current = payload;
        await importBootstrapPayload(payload);
        window.location.reload();
        return "imported" as const;
      })();
    }

    let active = true;
    const attempt = standaloneBootstrapPromiseRef.current;
    void attempt
      .then((result) => {
        if (!active || result === "imported") return;
        setStandaloneBootstrapStatus("missing");
      })
      .catch((error) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Could not import your first SheetLog transaction.";
        setStandaloneBootstrapStatus("error");
        setStandaloneBootstrapError(message);
        onToast(message);
      });

    return () => {
      active = false;
    };
  }, [onToast, phase, standalone, standaloneBootstrapStatus]);

  useEffect(() => {
    if (phase !== "ready" || session.status !== "local") {
      setImportedReceipt(null);
      setHasLoadedImportedReceipt(false);
      return;
    }
    let active = true;
    setHasLoadedImportedReceipt(false);
    void readImportedBootstrapReceipt()
      .then((receipt) => {
        if (!active) return;
        setImportedReceipt(receipt);
        setHasLoadedImportedReceipt(true);
      })
      .catch((error) => {
        if (!active) return;
        setImportedReceipt(null);
        setHasLoadedImportedReceipt(true);
        onToast(
          error instanceof Error
            ? error.message
            : "Could not read the imported transaction receipt.",
        );
      });
    return () => {
      active = false;
    };
  }, [onToast, phase, session.status]);

  const documentMeta = useMemo(() => {
    if (phase === "needs_auth") {
      return {
        title: "SheetLog — Start logging",
        description:
          "Pick your everyday account and log your first transaction without signing in.",
      };
    }
    if (phase !== "ready") {
      return {
        title: "SheetLog — Setup",
        description: "Finish setting up your SheetLog workspace.",
      };
    }
    if (resolvedSelectedAppId === null) {
      return {
        title: "SheetLog — Choose a tracker",
        description: "Pick what you want to log.",
      };
    }
    if (selectedApp) {
      return {
        title: `SheetLog — ${selectedApp.name}`,
        description: selectedApp.description,
      };
    }
    return {
      title: "SheetLog",
      description: "Lightning-fast personal logging.",
    };
  }, [phase, resolvedSelectedAppId, selectedApp]);

  useDocumentMeta(documentMeta);

  useEffect(() => {
    if (phase !== "ready") return;
    if (isSelectedAppLoading) return;
    if (resolvedSelectedAppId !== null) return;
    setSelectedApp.mutate("money");
  }, [
    phase,
    isSelectedAppLoading,
    resolvedSelectedAppId,
    setSelectedApp,
  ]);

  const retryStandaloneBootstrap = () => {
    standaloneBootstrapPromiseRef.current = null;
    setStandaloneBootstrapStatus("checking");
  };

  const startFreshStandalone = () => {
    standaloneBootstrapPromiseRef.current = null;
    consumedStandaloneBootstrapRef.current = null;
    setStandaloneBootstrapError(null);
    setStandaloneBootstrapStatus("missing");
  };

  const dismissImportedReceipt = async () => {
    try {
      await clearImportedBootstrapReceipt();
      setImportedReceipt(null);
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Could not close the imported transaction receipt.",
      );
    }
  };

  if (phase === "booting") {
    return <LoadingScreen />;
  }

  if (phase === "needs_auth") {
    if (standalone && standaloneBootstrapStatus === "checking") {
      return <LoadingScreen label="Bringing your first log into SheetLog…" />;
    }
    if (standalone && standaloneBootstrapStatus === "error") {
      return (
        <main className="mx-auto flex h-dvh w-full max-w-md flex-col items-center justify-center bg-background px-6 text-center text-foreground">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-danger/10 text-danger">
            <AlertCircle className="h-8 w-8" />
          </span>
          <h1 className="mt-6 text-2xl font-black tracking-[-0.045em]">
            We could not bring in your first log.
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
            {standaloneBootstrapError ??
              "Retry the secure handoff, or start a fresh local workspace in this installed app."}
          </p>
          <button
            type="button"
            onClick={retryStandaloneBootstrap}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-primary px-5 text-[13px] font-black text-primary-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Retry handoff
          </button>
          <button
            type="button"
            onClick={startFreshStandalone}
            className="mt-3 h-12 w-full rounded-[16px] border border-border bg-card px-5 text-[12px] font-bold"
          >
            Start fresh in this app
          </button>
        </main>
      );
    }
    return (
      <TinyWinActivation
        initialCountryCode={tinyWinDefaults.countryCode}
        initialCurrency={tinyWinDefaults.currency}
        onToast={onToast}
      />
    );
  }

  if (phase !== "ready") {
    return <OnboardingFlow onToast={onToast} />;
  }

  if (session.status === "local" && !hasLoadedImportedReceipt) {
    return <LoadingScreen label="Opening your local ledger…" />;
  }

  if (session.status === "local" && importedReceipt) {
    return (
      <ImportedReceipt
        receipt={importedReceipt}
        onContinue={dismissImportedReceipt}
      />
    );
  }

  if (isSelectedAppLoading) {
    return <LoadingScreen />;
  }

  if (resolvedSelectedAppId === null) {
    return (
      <div className="relative h-full w-full">
        <SheetlogAppPicker
          value={resolvedSelectedAppId}
          onChange={(next) => setSelectedApp.mutate(next)}
        />
      </div>
    );
  }

  if (resolvedSelectedAppId === "money") {
    return <TransactionFlow />;
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-sm font-semibold">
          {selectedApp?.name ?? "This tracker"}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          This tracker is coming soon. For now, SheetLog ships with the Money tracker.
        </p>
      </div>
      <button
        type="button"
        className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        onClick={() => setSelectedApp.mutate("money")}
      >
        Use Money tracker
      </button>
      <button
        type="button"
        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-2"
        onClick={() => setSelectedApp.mutate(null)}
      >
        Pick another tracker
      </button>
    </div>
  );
}
