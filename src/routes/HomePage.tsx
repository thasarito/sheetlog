import { TransactionFlow } from "../components/TransactionFlow";
import { OnboardingFlow } from "../components/OnboardingFlow";

import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useAppPhase } from "../hooks/useAppPhase";
import { useCallback } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function HomePage() {
  useDocumentMeta({
    title: "SheetLog",
    description: "Rapid financial logging to Google Sheets",
  });

  const { phase } = useAppPhase();
  const onToast = useCallback((message: string) => {
    toast(message);
  }, []);

  return (
    <div className="relative h-full w-full flex flex-col">
      <div className="flex-1">
        {phase === "ready" ? (
          <TransactionFlow />
        ) : phase === "booting" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <OnboardingFlow onToast={onToast} />
        )}
      </div>
    </div>
  );
}
