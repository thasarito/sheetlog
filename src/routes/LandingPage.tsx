import '@khmyznikov/pwa-install';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, Download, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { SHEETLOG_APPS } from '../lib/sheetlogApps';

type PWAInstallElement = HTMLElement & {
  showDialog: (open?: boolean) => void;
  isInstallAvailable?: boolean;
  isAppleMobilePlatform?: boolean;
  isAppleDesktopPlatform?: boolean;
  isUnderStandaloneMode?: boolean;
};

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  return (
    mediaQuery.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const pwaInstallRef = useRef<PWAInstallElement | null>(null);
  const [isPwaInstallAvailable, setIsPwaInstallAvailable] = useState(false);
  const standalone = isStandaloneMode();
  const baseUrl = import.meta.env.BASE_URL;
  const iconUrl = `${baseUrl}icon.svg`;
  const manifestUrl = `${baseUrl}manifest.webmanifest`;

  useDocumentMeta({
    title: 'SheetLog — Install',
    description: 'Install SheetLog as a PWA for one-tap logging to Google Sheets.',
  });

  useEffect(() => {
    if (!standalone) {
      return;
    }
    navigate({ to: '/app', replace: true, search: {} });
  }, [navigate, standalone]);

  const updatePwaAvailability = useCallback(() => {
    const element = pwaInstallRef.current;
    if (!element) {
      return;
    }
    const available =
      Boolean(element.isInstallAvailable) ||
      Boolean(element.isAppleMobilePlatform) ||
      Boolean(element.isAppleDesktopPlatform);
    setIsPwaInstallAvailable(available);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const element = document.getElementById('pwa-install') as PWAInstallElement | null;
    if (!element) {
      return;
    }
    pwaInstallRef.current = element;
    const handleAvailable = () => updatePwaAvailability();
    const frame = window.requestAnimationFrame(updatePwaAvailability);
    element.addEventListener('pwa-install-available-event', handleAvailable);
    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener('pwa-install-available-event', handleAvailable);
    };
  }, [updatePwaAvailability]);

  const handleInstall = useCallback(() => {
    pwaInstallRef.current?.showDialog(true);
  }, []);

  if (standalone) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-surface">
          <img src={iconUrl} alt="" className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground">Opening…</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.16)_0%,transparent_45%),radial-gradient(circle_at_80%_0%,hsl(var(--accent)/0.22)_0%,transparent_40%),radial-gradient(circle_at_50%_100%,hsl(var(--primary)/0.10)_0%,transparent_55%)]"
      />

      <header className="z-20 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface">
              <img src={iconUrl} alt="" className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold tracking-wide">SheetLog</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface"
            >
              Continue <ArrowRight className="ml-2 inline h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto">
        <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-14 sm:pb-16 sm:pt-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                Install-first experience
              </div>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Add SheetLog to your home screen.
              </h1>
              <p className="text-base leading-7 text-muted-foreground">
                SheetLog is a collection of tiny trackers that write directly to Google Sheets.
                Install it once, then log with one tap.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleInstall}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Add to home screen
                </button>
                <Link
                  to="/app"
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface"
                >
                  Use in browser <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold">After you install</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Opening SheetLog from your home screen takes you straight into onboarding —
                  connect Google, pick a sheet, and start logging.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-6">
                <p className="text-sm font-semibold">Pick a tracker</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  The Money tracker ships today. More trackers are coming.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {SHEETLOG_APPS.map((app) => (
                    <div key={app.id} className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{app.name}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {app.description}
                          </p>
                        </div>
                        {app.status === 'available' ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                        ) : (
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <p className="text-sm font-semibold">Install tips</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <p className="text-sm font-semibold">iPhone / iPad</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                      <li>Open in Safari</li>
                      <li>Share → Add to Home Screen</li>
                    </ol>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <p className="text-sm font-semibold">Android / Chrome</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                      <li>Open in Chrome</li>
                      <li>Menu → Install app</li>
                    </ol>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {isPwaInstallAvailable
                    ? 'Tap “Add to home screen” to open the install dialog.'
                    : 'If you don’t see an install option, try Safari on iOS or Chrome on Android.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-border bg-surface/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">SheetLog</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Installable PWA for fast logging to Google Sheets.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link className="transition hover:text-foreground" to="/privacy">
                Privacy
              </Link>
              <Link className="transition hover:text-foreground" to="/terms">
                Terms
              </Link>
              <a className="transition hover:text-foreground" href="mailto:support@thasarito.com">
                support@thasarito.com
              </a>
            </div>
          </div>
        </footer>
      </main>

      <pwa-install
        id="pwa-install"
        manifest-url={manifestUrl}
        manual-apple="true"
        manual-chrome="true"
      />
    </div>
  );
}
