import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnboarding } from "../../hooks/useOnboarding";
import {
  type BankInstitution,
  getCountryCatalog,
} from "../../lib/bankCatalog";
import { consumeBootstrap } from "../../lib/bootstrapClient";
import { importBootstrapPayload } from "../../lib/bootstrapImport";
import type {
  BootstrapPayload,
  BootstrapSetup,
} from "../../lib/bootstrapPayload";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import { STORAGE_KEYS } from "../../lib/constants";
import type { Currency } from "../../lib/currencies";
import { isStandaloneMode } from "../../lib/pwa";
import type { TransactionRecord } from "../../lib/types";
import { TransactionFlow } from "../TransactionFlow";
import { BankPickerScreen } from "./BankPickerScreen";
import { BootstrapTransactionsProvider } from "./BootstrapTransactionsProvider";
import { InstallGateScreen } from "./InstallGateScreen";

const RECEIPT_DISPLAY_MS = 1_800;

type TinyWinActivationProps = {
  initialCountryCode: string;
  initialCurrency: Currency;
  onToast: (message: string) => void;
};

function cloneDefaultCategories() {
  return {
    expense: DEFAULT_CATEGORIES.expense.map((item) => ({ ...item })),
    income: DEFAULT_CATEGORIES.income.map((item) => ({ ...item })),
    transfer: DEFAULT_CATEGORIES.transfer.map((item) => ({ ...item })),
  };
}

export function TinyWinActivation({
  initialCountryCode,
  initialCurrency,
  onToast,
}: TinyWinActivationProps) {
  const { updateOnboarding } = useOnboarding();
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [currency, setCurrency] = useState(initialCurrency);
  const [setup, setSetup] = useState<BootstrapSetup | null>(null);
  const [capturedTransaction, setCapturedTransaction] =
    useState<TransactionRecord | null>(null);
  const [showInstallGate, setShowInstallGate] = useState(false);
  const [isSelectingBank, setIsSelectingBank] = useState(false);
  const [standaloneError, setStandaloneError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);
  const selectingBankRef = useRef(false);
  const importingRef = useRef(false);
  const consumedBootstrapRef = useRef<BootstrapPayload | null>(null);

  const cancelPendingTransition = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      cancelPendingTransition();
    },
    [cancelPendingTransition],
  );

  const importIntoStandaloneApp = useCallback(async () => {
    if (importingRef.current) return;
    importingRef.current = true;
    setIsImporting(true);
    setStandaloneError(null);
    try {
      const payload =
        consumedBootstrapRef.current ?? (await consumeBootstrap());
      if (!payload) {
        throw new Error(
          "The first-transaction handoff is missing or expired. Return to SheetLog in your browser and complete the first log again.",
        );
      }
      consumedBootstrapRef.current = payload;
      await importBootstrapPayload(payload);
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not finish local SheetLog activation.";
      setStandaloneError(message);
      onToast(message);
    } finally {
      importingRef.current = false;
      setIsImporting(false);
    }
  }, [onToast]);

  const handleCaptured = useCallback(
    (record: TransactionRecord) => {
      cancelPendingTransition();
      consumedBootstrapRef.current = null;
      setCapturedTransaction(record);
      setStandaloneError(null);
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        if (isStandaloneMode()) {
          void importIntoStandaloneApp();
          return;
        }
        setShowInstallGate(true);
      }, RECEIPT_DISPLAY_MS);
    },
    [cancelPendingTransition, importIntoStandaloneApp],
  );

  const handleCleared = useCallback(() => {
    cancelPendingTransition();
    consumedBootstrapRef.current = null;
    setCapturedTransaction(null);
    setShowInstallGate(false);
    setStandaloneError(null);
  }, [cancelPendingTransition]);

  const selectBank = useCallback(
    async (bank: BankInstitution, bankCountryCode: string) => {
      if (selectingBankRef.current) return;
      selectingBankRef.current = true;
      setIsSelectingBank(true);
      const selectedAt = new Date().toISOString();
      const nextSetup: BootstrapSetup = {
        countryCode: bankCountryCode,
        currency,
        account: {
          institutionId: bank.id,
          name: bank.name,
          mark: bank.mark,
          color: bank.color,
        },
      };
      try {
        await updateOnboarding({
          accounts: [
            {
              name: bank.name,
              icon: "Wallet",
              color: bank.color,
            },
          ],
          accountsConfirmed: true,
          categories: cloneDefaultCategories(),
          categoriesConfirmed: true,
          analyticsBaseCurrency: currency,
          analyticsBaseCurrencyUpdatedAt: selectedAt,
        });
        window.localStorage.setItem(STORAGE_KEYS.LAST_ACCOUNT, bank.name);
        window.localStorage.setItem(STORAGE_KEYS.LAST_CURRENCY, currency);
        setCountryCode(bankCountryCode);
        setSetup(nextSetup);
      } catch (error) {
        onToast(
          error instanceof Error
            ? error.message
            : "Could not prepare your first SheetLog account.",
        );
      } finally {
        selectingBankRef.current = false;
        setIsSelectingBank(false);
      }
    },
    [currency, onToast, updateOnboarding],
  );

  const startFresh = () => {
    cancelPendingTransition();
    consumedBootstrapRef.current = null;
    setStandaloneError(null);
    setCapturedTransaction(null);
    setShowInstallGate(false);
    setSetup(null);
  };

  if (standaloneError && capturedTransaction) {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col items-center justify-center bg-background px-6 text-center text-foreground">
        <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-danger/10 text-danger">
          <AlertCircle className="h-8 w-8" />
        </span>
        <h1 className="mt-6 text-2xl font-black tracking-[-0.045em]">
          Your first log still needs to be imported.
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          {standaloneError}
        </p>
        <button
          type="button"
          disabled={isImporting}
          onClick={() => void importIntoStandaloneApp()}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-primary px-5 text-[13px] font-black text-primary-foreground disabled:opacity-60"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Retry activation
        </button>
        <button
          type="button"
          disabled={isImporting}
          onClick={startFresh}
          className="mt-3 h-12 w-full rounded-[16px] border border-border bg-card px-5 text-[12px] font-bold disabled:opacity-60"
        >
          Start a fresh local workspace
        </button>
      </main>
    );
  }

  if (showInstallGate && capturedTransaction) {
    return <InstallGateScreen transaction={capturedTransaction} />;
  }

  if (setup) {
    return (
      <BootstrapTransactionsProvider
        setup={setup}
        onCaptured={handleCaptured}
        onCleared={handleCleared}
      >
        <TransactionFlow />
      </BootstrapTransactionsProvider>
    );
  }

  const safeCatalog = getCountryCatalog(countryCode);
  return (
    <BankPickerScreen
      countryCode={safeCatalog.code}
      currency={currency}
      isSelecting={isSelectingBank}
      onCountryChange={setCountryCode}
      onCurrencyChange={setCurrency}
      onSelectBank={(bank, selectedCountryCode) =>
        void selectBank(bank, selectedCountryCode)
      }
    />
  );
}
