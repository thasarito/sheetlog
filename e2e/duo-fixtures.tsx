import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { MockAppProviders } from "../src/app/providers/mock/MockAppProviders";
import { AccountsScreen } from "../src/components/OnboardingFlow/AccountsScreen";
import { CategoriesScreen } from "../src/components/OnboardingFlow/CategoriesScreen";
import { ConnectScreen } from "../src/components/OnboardingFlow/ConnectScreen";
import { DoneScreen } from "../src/components/OnboardingFlow/DoneScreen";
import { SheetLocationScreen } from "../src/components/OnboardingFlow/SheetLocationScreen";
import { SettingsView } from "../src/components/SettingsView";
import { BankPickerScreen } from "../src/components/TinyWinOnboarding/BankPickerScreen";
import { ImportedReceipt } from "../src/components/TinyWinOnboarding/ImportedReceipt";
import { InstallGateScreen } from "../src/components/TinyWinOnboarding/InstallGateScreen";
import { TransactionFlow } from "../src/components/TransactionFlow";
import { StepAmount } from "../src/components/TransactionFlow/StepAmount";
import { StepReceipt } from "../src/components/TransactionFlow/StepReceipt";
import { TransactionHistoryView } from "../src/components/TransactionFlow/TransactionHistoryView";
import { useAnalyticsSync } from "../src/components/TransactionFlow/useAnalyticsSync";
import { useTransactionForm } from "../src/components/TransactionFlow/useTransactionForm";
import { MOCK_ONBOARDING_STATE } from "../src/lib/mock";
import { setOnboardingState } from "../src/lib/settings";
import { ThemeProvider } from "../src/theme";
import "../src/styles";
import "../src/components/TinyWinOnboarding/playful.css";
import "../src/components/TinyWinOnboarding/playful-followup.css";

const noop = () => {};
const meta = { stepLabel: "Setup", stepNumber: 2, totalSteps: 4, progressPercent: 50 };
const transaction = {
  id: "duo-example",
  type: "expense" as const,
  amount: 120,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Dining Out",
  date: "2026-08-15T12:00:00",
  note: "Lunch with friends",
  status: "synced" as const,
  createdAt: "2026-08-15T12:00:00",
  updatedAt: "2026-08-15T12:00:00",
};

function AmountFixture() {
  const form = useTransactionForm({ initialValues: {
    type: "expense", category: "Dining Out", amount: "120", currency: "THB",
    account: "Cash", forValue: "Me", note: "Lunch with friends", dateObject: new Date("2026-08-15T12:00:00"),
  } });
  return <StepAmount form={form} accounts={["Cash", "Bank"]} onBack={noop} onSubmit={noop} />;
}

function DashboardFixture({ screen }: { screen: string }) {
  const analytics = useAnalyticsSync("THB");
  if (screen === "settings") return <SettingsView onToast={noop} analyticsSync={analytics} />;
  return <TransactionHistoryView history={analytics.history} baseCurrency="THB" onEditTransaction={noop} />;
}

function Fixture() {
  const screen = new URLSearchParams(window.location.search).get("screen") ?? "entry";
  let content: React.ReactNode;
  switch (screen) {
    case "connect": content = <ConnectScreen meta={meta} isConnecting={false} onConnect={noop} />; break;
    case "sheet": content = <SheetLocationScreen meta={meta} locationMode="root" folderIdInput="" isSettingUpSheet={false} onLocationModeChange={noop} onFolderIdChange={noop} onSubmit={noop} />; break;
    case "accounts": content = <AccountsScreen meta={meta} accountInput="" accounts={MOCK_ONBOARDING_STATE.accounts} isSaving={false} onAccountInputChange={noop} onAddAccount={noop} onRemoveAccount={noop} onContinue={noop} />; break;
    case "categories": content = <CategoriesScreen meta={meta} categories={MOCK_ONBOARDING_STATE.categories} isSaving={false} onChange={noop} onContinue={noop} />; break;
    case "done": content = <DoneScreen meta={meta} />; break;
    case "bank": content = <BankPickerScreen countryCode="TH" currency="THB" onCountryChange={noop} onCurrencyChange={noop} onSelectBank={noop} onSignIn={noop} />; break;
    case "install": content = <InstallGateScreen transaction={transaction} />; break;
    case "imported": content = <ImportedReceipt receipt={{ bootstrapId: "duo-example", transaction }} onContinue={noop} />; break;
    case "amount": content = <AmountFixture />; break;
    case "receipt": content = <StepReceipt type="expense" category="Dining Out" amount="120" currency="THB" account="Cash" forValue="Me" dateObject={new Date("2026-08-15T12:00:00")} note="Lunch with friends" isPending={false} isSuccess isError={false} onDone={noop} />; break;
    case "history":
    case "settings": content = <DashboardFixture screen={screen} />; break;
    default: content = <TransactionFlow />;
  }
  return <div className="flex h-full w-full flex-col overflow-visible">{content}</div>;
}

const rootRoute = createRootRoute({ component: Fixture });
const route = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Fixture });
const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

await setOnboardingState(MOCK_ONBOARDING_STATE, "mock-sheet-id-dev");
const root = document.getElementById("root");
if (!root) throw new Error("Fixture root is missing");
ReactDOM.createRoot(root).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><ThemeProvider><MockAppProviders><RouterProvider router={router} /></MockAppProviders></ThemeProvider></QueryClientProvider></React.StrictMode>,
);
