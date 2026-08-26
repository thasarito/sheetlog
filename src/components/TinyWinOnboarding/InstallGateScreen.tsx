import "@khmyznikov/pwa-install";
import { Download, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import type { TransactionRecord, TransactionType } from "../../lib/types";
import { PlayfulMascot } from "./PlayfulMascot";
import { SheetLogLogo } from "./SheetLogLogo";

type PWAInstallElement = HTMLElement & {
  showDialog: (open?: boolean) => void;
};

type Platform = "ios" | "android" | "desktop";

type InstallStep = {
  title: string;
  description: string;
};

const PLATFORM_LABELS: Record<Platform, string> = {
  ios: "iPhone",
  android: "Android",
  desktop: "Desktop",
};

const PLATFORM_STEPS: Record<Platform, InstallStep[]> = {
  ios: [
    {
      title: "Tap Share in Safari",
      description: "Use the square with the upward arrow.",
    },
    {
      title: "Choose Add to Home Screen",
      description: "Scroll the actions list if needed.",
    },
    {
      title: "Tap Add, then open SheetLog",
      description: "Your first transaction imports automatically.",
    },
  ],
  android: [
    {
      title: "Tap Install SheetLog",
      description: "Approve Chrome’s installation prompt.",
    },
    {
      title: "Open the new app icon",
      description: "SheetLog opens in its own app window.",
    },
    {
      title: "Meet your first log",
      description: "The secure handoff imports it automatically.",
    },
  ],
  desktop: [
    {
      title: "Use the install icon",
      description: "Find it on the right side of the address bar.",
    },
    {
      title: "Choose Install",
      description: "SheetLog opens like a desktop app.",
    },
    {
      title: "Open SheetLog",
      description: "Your staged transaction appears inside.",
    },
  ],
};

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

function signedAmountLabel(transaction: TransactionRecord): string {
  const amount = amountLabel(transaction);
  if (transaction.type === "expense") return `−${amount}`;
  if (transaction.type === "income") return `+${amount}`;
  return amount;
}

function transactionTypeLabel(type: TransactionType): string {
  if (type === "expense") return "Expense";
  if (type === "income") return "Income";
  return "Transfer";
}

export function InstallGateScreen({
  transaction,
}: {
  transaction: TransactionRecord;
}) {
  const detectedPlatform = useMemo(detectPlatform, []);
  const [platform, setPlatform] = useState<Platform>(detectedPlatform);
  const manifestUrl = `${import.meta.env.BASE_URL}manifest.webmanifest`;

  const openInstallPrompt = () => {
    const element = document.getElementById(
      "tiny-win-pwa-install",
    ) as PWAInstallElement | null;
    element?.showDialog(true);
  };

  return (
    <main className="tiny-win-playful">
      <div className="tiny-win-playful-screen">
        <header className="tiny-win-topbar">
          <div className="tiny-win-brand">
            <SheetLogLogo className="tiny-win-brand-logo" />
            <span>SheetLog</span>
          </div>
          <span className="tiny-win-eyebrow">Step 2 of 2</span>
        </header>

        <PlayfulMascot mode="install" accountMark={transaction.account} />

        <section className="tiny-win-copy tiny-win-install-copy">
          <p className="tiny-win-eyebrow">Tiny win complete · Keep it safe</p>
          <h1 className="tiny-win-title">
            Install SheetLog to keep your first log.
          </h1>
          <p className="tiny-win-lead">
            Your entry is waiting in a short-lived secure handoff. Open the
            installed app to make it durable local data.
          </p>
        </section>

        <section
          aria-label="Pending first transaction"
          className="tiny-win-log-preview"
          data-visual-role="pending-log"
        >
          <div className="tiny-win-log-preview-header">
            <span className="tiny-win-log-preview-icon" aria-hidden="true">
              <ReceiptText />
            </span>
            <span className="tiny-win-log-preview-heading">
              <small>Your first transaction</small>
              <strong>Waiting for the installed app</strong>
            </span>
            <span className="tiny-win-pending-pill">Pending import</span>
          </div>

          <div className="tiny-win-log-preview-divider" />

          <div className="tiny-win-log-preview-row">
            <span className="tiny-win-log-preview-details">
              <strong>{transaction.category}</strong>
              <small>
                {transaction.account} · {transactionTypeLabel(transaction.type)}
              </small>
            </span>
            <strong
              className={`tiny-win-log-preview-amount tiny-win-log-preview-amount--${transaction.type}`}
            >
              {signedAmountLabel(transaction)}
            </strong>
          </div>

          {transaction.note ? (
            <p className="tiny-win-log-preview-note">{transaction.note}</p>
          ) : null}
        </section>

        <div
          className="tiny-win-platform-switcher"
          aria-label="Installation platform"
        >
          {(Object.keys(PLATFORM_LABELS) as Platform[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={platform === option}
              onClick={() => setPlatform(option)}
            >
              {PLATFORM_LABELS[option]}
            </button>
          ))}
        </div>

        <ol className="tiny-win-install-steps">
          {PLATFORM_STEPS[platform].map((step, index) => (
            <li key={step.title} className="tiny-win-step-card">
              <span className="tiny-win-step-number">{index + 1}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-auto">
          <button
            type="button"
            data-playful-pressable="true"
            onClick={openInstallPrompt}
            className="tiny-win-primary-button"
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Install SheetLog
          </button>
          <p className="tiny-win-gate-note">
            No transaction has been stored in this browser. Browser-only
            continuation remains unavailable so the installed app is the one
            durable local workspace.
          </p>
        </div>

        <pwa-install
          id="tiny-win-pwa-install"
          manifest-url={manifestUrl}
          manual-apple="true"
          manual-chrome="true"
        />
      </div>
    </main>
  );
}
