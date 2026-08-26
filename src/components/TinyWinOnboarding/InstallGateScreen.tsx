import "@khmyznikov/pwa-install";
import {
  Check,
  Download,
  ExternalLink,
  Share,
  Sparkles,
  SquarePlus,
} from "lucide-react";
import { useMemo } from "react";
import type { TransactionRecord } from "../../lib/types";

type PWAInstallElement = HTMLElement & {
  showDialog: (open?: boolean) => void;
};

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

function amountLabel(transaction: TransactionRecord): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: transaction.currency,
      maximumFractionDigits: 2,
    }).format(transaction.amount);
  } catch {
    return `${transaction.currency} ${transaction.amount}`;
  }
}

function InstallSteps({ platform }: { platform: Platform }) {
  if (platform === "ios") {
    return (
      <ol className="space-y-2.5">
        <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <Share className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-[12px] font-bold">Tap Share in Safari</strong>
            <small className="mt-0.5 block text-[10px] text-muted-foreground">Use the square with the upward arrow.</small>
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <SquarePlus className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-[12px] font-bold">Choose Add to Home Screen</strong>
            <small className="mt-0.5 block text-[10px] text-muted-foreground">Then tap Add in the top-right corner.</small>
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-[12px] font-bold">Open SheetLog from your Home Screen</strong>
            <small className="mt-0.5 block text-[10px] text-muted-foreground">Your first transaction will be imported automatically.</small>
          </span>
        </li>
      </ol>
    );
  }

  if (platform === "android") {
    return (
      <ol className="space-y-2.5">
        <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <Download className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-[12px] font-bold">Tap Install SheetLog</strong>
            <small className="mt-0.5 block text-[10px] text-muted-foreground">Approve Chrome’s installation prompt.</small>
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-[12px] font-bold">Open the new SheetLog app</strong>
            <small className="mt-0.5 block text-[10px] text-muted-foreground">Your first log appears there automatically.</small>
          </span>
        </li>
      </ol>
    );
  }

  return (
    <ol className="space-y-2.5">
      <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
          <Download className="h-4 w-4" />
        </span>
        <span>
          <strong className="block text-[12px] font-bold">Install from your browser</strong>
          <small className="mt-0.5 block text-[10px] text-muted-foreground">Use the install icon in the address bar or the button below.</small>
        </span>
      </li>
      <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
          <ExternalLink className="h-4 w-4" />
        </span>
        <span>
          <strong className="block text-[12px] font-bold">Launch SheetLog as an app</strong>
          <small className="mt-0.5 block text-[10px] text-muted-foreground">The staged transaction imports on first launch.</small>
        </span>
      </li>
    </ol>
  );
}

export function InstallGateScreen({
  transaction,
}: {
  transaction: TransactionRecord;
}) {
  const platform = useMemo(detectPlatform, []);
  const manifestUrl = `${import.meta.env.BASE_URL}manifest.webmanifest`;

  const openInstallPrompt = () => {
    const element = document.getElementById(
      "tiny-win-pwa-install",
    ) as PWAInstallElement | null;
    element?.showDialog(true);
  };

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto bg-background px-5 pb-safe-offset-6 pt-safe-offset-5 text-foreground">
      <div className="pointer-events-none absolute -left-24 top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <header className="relative z-10 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
          <Check className="h-5 w-5" strokeWidth={3} />
        </span>
        <div>
          <p className="text-[15px] font-black tracking-[-0.035em]">Tiny win complete</p>
          <p className="text-[10px] font-semibold text-muted-foreground">Your first entry is ready to move</p>
        </div>
      </header>

      <section className="relative z-10 mt-9">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Final step</p>
        <h1 className="mt-2 text-[clamp(2.1rem,9vw,2.8rem)] font-black leading-[0.98] tracking-[-0.06em]">
          Install SheetLog to keep your first log.
        </h1>
        <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
          The transaction is waiting in a short-lived secure handoff. It becomes local app data only after you open the installed SheetLog.
        </p>
      </section>

      <section
        aria-label="First transaction ready to import"
        className="relative z-10 mt-6 overflow-hidden rounded-[26px] border border-border bg-card p-4"
      >
        <span className="pointer-events-none absolute -bottom-12 -right-10 h-32 w-32 rounded-full border-[24px] border-primary/10" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black">{transaction.category}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {transaction.account} · {transaction.type === "expense" ? "Expense" : transaction.type}
            </p>
          </div>
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-black text-success">Ready</span>
        </div>
        <p className="relative z-10 mt-6 text-[clamp(2.35rem,12vw,3.2rem)] font-black leading-none tracking-[-0.06em] tabular-nums">
          {amountLabel(transaction)}
        </p>
        {transaction.note ? (
          <p className="relative z-10 mt-3 truncate text-[11px] text-muted-foreground">{transaction.note}</p>
        ) : null}
      </section>

      <section className="relative z-10 mt-5">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          {platform === "ios" ? "On iPhone or iPad" : platform === "android" ? "On Android" : "On this computer"}
        </p>
        <InstallSteps platform={platform} />
      </section>

      <div className="relative z-10 mt-auto pt-6">
        <button
          type="button"
          onClick={openInstallPrompt}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-[19px] bg-primary px-5 text-[14px] font-black text-primary-foreground transition active:scale-[0.985]"
        >
          <Download className="h-5 w-5" />
          Install SheetLog
        </button>
        <p className="mt-3 text-center text-[10px] leading-4 text-muted-foreground">
          No transaction has been stored in this browser. There is no browser-only continuation because the installed app is the durable local workspace.
        </p>
      </div>

      <pwa-install
        id="tiny-win-pwa-install"
        manifest-url={manifestUrl}
        manual-apple="true"
        manual-chrome="true"
      />
    </main>
  );
}
