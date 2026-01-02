import React from "react";
import { Plug } from "lucide-react";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenMeta } from "./types";

type ConnectScreenProps = {
  meta: ScreenMeta;
  isConnecting: boolean;
  onConnect: () => void;
};

export function ConnectScreen({
  meta,
  isConnecting,
  onConnect,
}: ConnectScreenProps) {
  return (
    <ScreenFrame
      {...meta}
      title="Connect Google"
      subtitle="Securely sign in to authorize SheetLog_DB in Drive."
      icon={<Plug className="h-5 w-5" />}
      footer={
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-60"
          onClick={onConnect}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "Connect Google Account"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-surface-2/80 px-4 py-3 text-sm text-muted-foreground">
          We only access the SheetLog_DB file and its folder.
        </div>
        <p className="text-xs text-muted-foreground">
          Set VITE_GOOGLE_CLIENT_ID in your env.
        </p>
      </div>
    </ScreenFrame>
  );
}
