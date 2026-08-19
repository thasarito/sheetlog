import '@khmyznikov/pwa-install';
import { Link, useNavigate } from '@tanstack/react-router';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  Sheet,
  Smartphone,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { DemoProvider } from '../components/LandingDemo/DemoContext';
import { IphoneFrame } from '../components/LandingDemo/IphoneFrame';
import { SpreadsheetPreview } from '../components/LandingDemo/SpreadsheetPreview';
import { TransactionFlowDemo } from '../components/LandingDemo/TransactionFlowDemo';
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

// Animated connection line between phone and sheet
function DataFlowLine({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 220 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background dashed line */}
      <path
        d="M10 20 L 190 20"
        stroke="hsl(var(--border))"
        strokeWidth="2"
        strokeDasharray="6 4"
        fill="none"
      />
      {/* Arrow at end */}
      <path
        d="M185 14 L 200 20 L 185 26"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Animated data packets */}
      <motion.g
        animate={{ x: [0, 180] }}
        transition={{
          duration: 1.8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
          repeatDelay: 0.8,
        }}
      >
        <circle cx="10" cy="20" r="5" fill="hsl(var(--primary))" />
        <circle cx="10" cy="20" r="8" fill="hsl(var(--primary) / 0.3)" />
      </motion.g>
      <motion.g
        animate={{ x: [0, 180] }}
        transition={{
          duration: 1.8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
          delay: 1.3,
          repeatDelay: 0.8,
        }}
      >
        <circle cx="10" cy="20" r="5" fill="hsl(160 84% 39% / 0.8)" />
        <circle cx="10" cy="20" r="8" fill="hsl(160 84% 39% / 0.2)" />
      </motion.g>
    </svg>
  );
}

// Floating Google Sheets badge that shows sync status
function SyncIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.4 }}
      className="inline-flex items-center gap-2 rounded-full border border-[#34A853]/30 bg-[#34A853]/10 px-3 py-1.5"
    >
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
        className="h-2 w-2 rounded-full bg-[#34A853]"
      />
      <span className="text-xs font-medium text-[#34A853]">Syncing to Google Sheets</span>
    </motion.div>
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

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  useDocumentMeta({
    title: 'SheetLog — Fast logging to Google Sheets',
    description:
      'SheetLog is an installable PWA for lightning-fast financial transaction logging to Google Sheets.',
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
    <div className="relative isolate flex h-full w-full flex-col overflow-y-auto overflow-x-hidden bg-background text-foreground">
      {/* Subtle grid pattern background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--border) / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--border) / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 70%)',
        }}
      />

      {/* Gradient orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
      >
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-[128px]" />
        <div className="absolute right-0 top-1/4 h-64 w-64 rounded-full bg-[#34A853]/15 blur-[96px]" />
      </div>

      <header className="relative z-20 border-b border-border/60 bg-background/80 backdrop-blur-lg sm:sticky sm:top-0">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface">
              <img src={iconUrl} alt="" className="h-5 w-5" />
            </span>
            <span className="text-base font-semibold tracking-tight">SheetLog</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="group flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface"
            >
              Open app
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* Hero Section */}
        <motion.section
          ref={heroRef}
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="mx-auto w-full max-w-6xl px-6 pb-16 pt-12 sm:pb-24 sm:pt-20"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 flex justify-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur">
              <Smartphone className="h-3.5 w-3.5 text-primary" />
              <span>Installable PWA</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>Works offline</span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto max-w-3xl text-center"
          >
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Log transactions to{' '}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-[#0F9D58] via-[#34A853] to-[#4285F4] bg-clip-text text-transparent">
                  Google Sheets
                </span>
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="absolute -bottom-1 left-0 h-1 w-full origin-left rounded-full bg-gradient-to-r from-[#0F9D58] to-[#4285F4]"
                />
              </span>
              {' '}in seconds
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Tap a category, enter an amount, done. Your data writes directly to a
              spreadsheet in your Google Drive—<strong className="text-foreground">you own your data</strong>.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <button
              type="button"
              onClick={handleInstall}
              className="group flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Install app
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-surface"
            >
              Try in browser
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          {/* Speed badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-8 flex justify-center"
          >
            <div className="inline-flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums tracking-tight">&lt;3</span>
                  <span className="text-sm font-medium text-muted-foreground">seconds</span>
                </div>
                <p className="text-xs text-muted-foreground">Average entry time</p>
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* Demo Section - The main visual */}
        <DemoProvider>
        <section className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:py-16">
          {/* Desktop layout */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8">
              {/* iPhone Demo */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="flex flex-col items-center"
              >
                <div className="w-[300px]">
                  <IphoneFrame
                    tapToStart
                    className="w-full"
                  >
                    {({ screen }) => <TransactionFlowDemo drawerContainer={screen} />}
                  </IphoneFrame>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  <span>Log a transaction</span>
                </div>
              </motion.div>

              {/* Connection visualization */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col items-center gap-3 self-center"
              >
                <SyncIndicator />
                <div className="relative h-20 w-56">
                  <DataFlowLine className="absolute inset-0" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Real-time sync</span>
              </motion.div>

              {/* Google Sheets Preview */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="flex flex-col items-center"
              >
                <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-1.5">
                  {/* Google Sheets header bar */}
                  <div className="flex items-center gap-3 rounded-t-xl bg-[#34A853]/8 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Sheet className="h-5 w-5 text-[#34A853]" />
                      <span className="font-medium text-foreground">SheetLog Transactions</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                        className="h-2 w-2 rounded-full bg-[#34A853]"
                      />
                      <span className="text-xs font-medium text-[#34A853]">Live</span>
                    </div>
                  </div>
                  <div className="p-2">
                    <SpreadsheetPreview />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Sheet className="h-4 w-4 text-[#34A853]" />
                  <span>Appears in your Google Sheet</span>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Mobile layout */}
          <div className="flex flex-col items-center gap-6 lg:hidden">
            {/* iPhone Demo */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-[300px]"
            >
              <IphoneFrame
                tapToStart
                className="w-full"
              >
                {({ screen }) => <TransactionFlowDemo drawerContainer={screen} />}
              </IphoneFrame>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                <span>Log a transaction</span>
              </div>
            </motion.div>

            {/* Sync indicator */}
            <div className="flex flex-col items-center gap-2">
              <SyncIndicator />
              <motion.div
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                className="text-muted-foreground"
              >
                <ChevronRight className="h-5 w-5 rotate-90" />
              </motion.div>
            </div>

            {/* Google Sheets Preview */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="w-full max-w-[380px]"
            >
              <div className="rounded-2xl border border-border bg-card p-1.5">
                <div className="flex items-center gap-3 rounded-t-xl bg-[#34A853]/8 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sheet className="h-5 w-5 text-[#34A853]" />
                    <span className="font-medium text-foreground">SheetLog Transactions</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                      className="h-2 w-2 rounded-full bg-[#34A853]"
                    />
                    <span className="text-xs font-medium text-[#34A853]">Live</span>
                  </div>
                </div>
                <div className="p-2">
                  <SpreadsheetPreview showHeader={false} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Sheet className="h-4 w-4 text-[#34A853]" />
                <span>Appears in your Google Sheet</span>
              </div>
            </motion.div>
          </div>
        </section>
        </DemoProvider>

        {/* Value Props */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why SheetLog?</h2>
            <p className="mt-3 text-muted-foreground">Simple tools that respect your time and your data.</p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <Zap className="h-5 w-5 text-primary" />,
                iconBg: 'bg-primary/10',
                title: 'Lightning fast',
                description: 'Tap a category, punch in an amount, done. Most entries take under 3 seconds.',
              },
              {
                icon: <Sheet className="h-5 w-5 text-[#34A853]" />,
                iconBg: 'bg-[#34A853]/10',
                title: 'Your data in Google Sheets',
                description: 'Entries go directly to a spreadsheet in your Google Drive. Full ownership, no lock-in.',
              },
              {
                icon: <CheckCircle2 className="h-5 w-5 text-accent-foreground" />,
                iconBg: 'bg-accent/50',
                title: 'Works offline',
                description: 'Entries queue locally and sync when you\'re back online. Never lose a transaction.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.iconBg}`}>
                  {item.icon}
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Details Section */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Left column */}
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-semibold">What SheetLog does</h3>
                <ul className="mt-4 space-y-3">
                  {[
                    'One-tap entry for expenses, income, and transfers.',
                    'Logs are appended to a Google Sheet in your Drive (created/managed by you).',
                    'Works offline: entries queue locally and sync when you\'re online.',
                  ].map((text) => (
                    <li key={text} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-semibold">FAQ</h3>
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value="google-access" className="border-b-0">
                    <AccordionTrigger className="py-3 text-sm">
                      Why Google access is requested
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <p className="text-sm leading-6 text-muted-foreground">
                        When you connect a Google account, SheetLog requests access only to do what
                        the app needs:
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>
                            Google Sheets: create and update your SheetLog spreadsheet, and write
                            your entries.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>
                            Google Drive: locate/create the SheetLog file and (optionally) move it
                            into a folder you choose.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>
                            Basic profile info: show your name and avatar in the app (optional).
                          </span>
                        </li>
                      </ul>
                      <p className="text-xs leading-5 text-muted-foreground">
                        SheetLog runs in your browser and talks directly to Google APIs — we
                        don&apos;t operate a backend server that stores your spreadsheet contents.
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        See{' '}
                        <Link to="/privacy" className="underline underline-offset-4">
                          Privacy
                        </Link>{' '}
                        for full details, including data retention, deletion, and how to revoke
                        access.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </motion.div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-semibold">Pick a tracker</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The Money tracker ships today. More trackers are coming.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {SHEETLOG_APPS.map((app) => (
                    <div
                      key={app.id}
                      className="rounded-xl border border-border bg-surface p-4 transition hover:border-primary/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{app.name}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {app.description}
                          </p>
                        </div>
                        {app.status === 'available' ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        ) : (
                          <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-semibold">Install tips</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-sm font-semibold">iPhone / iPad</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                      <li>Open in Safari</li>
                      <li>Share → Add to Home Screen</li>
                    </ol>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-sm font-semibold">Android / Chrome</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                      <li>Open in Chrome</li>
                      <li>Menu → Install app</li>
                    </ol>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  {isPwaInstallAvailable
                    ? 'Tap "Install app" above to open the install dialog.'
                    : "If you don't see an install option, try Safari on iOS or Chrome on Android."}
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-background to-surface p-8 sm:p-12"
          >
            <div className="relative z-10 mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to simplify your logging?
              </h2>
              <p className="mt-4 text-muted-foreground">
                Start logging transactions in seconds. Your data stays in your Google Drive.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={handleInstall}
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  Install SheetLog
                </button>
                <Link
                  to="/app"
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-surface"
                >
                  Continue in browser
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Decorative elements */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#34A853]/10 blur-3xl"
            />
          </motion.div>
        </section>

        <footer className="border-t border-border bg-surface/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background">
                  <img src={iconUrl} alt="" className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">SheetLog</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
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
