import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

import { OnboardingFlow } from "../components/OnboardingFlow";
import { SheetlogAppPicker } from "../components/SheetlogAppPicker";
import { TransactionFlow } from "../components/TransactionFlow";
import { useAppPhase } from "../hooks/useAppPhase";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useSelectedAppQuery, useSetSelectedApp } from "../hooks/useSelectedAppQuery";
import { getSheetlogApp } from "../lib/sheetlogApps";

export function HomePage() {
  const { phase } = useAppPhase();
  const onToast = useCallback((message: string) => {
    toast(message);
  }, []);

  const { data: selectedAppId, isLoading: isSelectedAppLoading } = useSelectedAppQuery();
  const setSelectedApp = useSetSelectedApp();
  const resolvedSelectedAppId = selectedAppId ?? null;
  const selectedApp = useMemo(
    () => (resolvedSelectedAppId ? getSheetlogApp(resolvedSelectedAppId) : null),
    [resolvedSelectedAppId],
  );

  const documentMeta = useMemo(() => {
    if (phase !== "ready") {
      return {
        title: "SheetLog — Setup",
        description: "Connect Google and set up your spreadsheet.",
      };
    }
    if (resolvedSelectedAppId === null) {
      return {
        title: "SheetLog — Choose a tracker",
        description: "Pick what you want to log to Google Sheets.",
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
      description: "Lightning-fast logging to Google Sheets.",
    };
  }, [phase, resolvedSelectedAppId, selectedApp]);

  useDocumentMeta(documentMeta);

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }
    if (isSelectedAppLoading) {
      return;
    }
    if (resolvedSelectedAppId !== null) {
      return;
    }
    setSelectedApp.mutate("money");
  }, [phase, isSelectedAppLoading, resolvedSelectedAppId, setSelectedApp]);

  if (phase === "booting") {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (phase !== "ready") {
    return <OnboardingFlow onToast={onToast} />;
  }

  if (isSelectedAppLoading) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (resolvedSelectedAppId === null) {
    return (
      <div className="relative h-full w-full">
        <SheetlogAppPicker value={resolvedSelectedAppId} onChange={(next) => setSelectedApp.mutate(next)} />
      </div>
    );
  }

  if (resolvedSelectedAppId === "money") {
    return <TransactionFlow />;
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-sm font-semibold">{selectedApp?.name ?? "This tracker"}</p>
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

