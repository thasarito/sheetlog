import {
  ChevronRight,
  Landmark,
  Search,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  type BankInstitution,
  getCountryCatalog,
  searchBankCatalog,
  SUPPORTED_COUNTRY_CODES,
  SUPPORTED_CURRENCIES,
} from "../../lib/bankCatalog";
import type { Currency } from "../../lib/currencies";

const CASH_ACCOUNT: BankInstitution = {
  id: "cash",
  name: "Cash",
  mark: "฿",
  color: "#16a34a",
  aliases: [],
};

type BankPickerScreenProps = {
  countryCode: string;
  currency: Currency;
  isSelecting?: boolean;
  onCountryChange: (countryCode: string) => void;
  onCurrencyChange: (currency: Currency) => void;
  onSelectBank: (bank: BankInstitution, countryCode: string) => void;
};

function BankMark({ bank }: { bank: BankInstitution }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-current/10 bg-background/80 px-1 text-center text-[11px] font-black tracking-[-0.04em]"
      style={{ color: bank.color }}
    >
      {bank.mark}
    </span>
  );
}

function BankTile({
  bank,
  subtitle,
  testId,
  disabled,
  onClick,
}: {
  bank: BankInstitution;
  subtitle: string;
  testId?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="group flex min-h-[78px] min-w-0 items-center gap-3 rounded-[21px] border border-border/75 bg-card px-3 py-3 text-left transition active:scale-[0.985] active:bg-surface-2 disabled:pointer-events-none disabled:opacity-55"
    >
      <BankMark bank={bank} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[13px] font-bold text-foreground">
          {bank.name}
        </strong>
        <small className="mt-1 block truncate text-[10px] font-medium text-muted-foreground">
          {subtitle}
        </small>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-active:translate-x-0.5" />
    </button>
  );
}

export function BankPickerScreen({
  countryCode,
  currency,
  isSelecting = false,
  onCountryChange,
  onCurrencyChange,
  onSelectBank,
}: BankPickerScreenProps) {
  const [showLocaleControls, setShowLocaleControls] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const catalog = getCountryCatalog(countryCode);
  const results = useMemo(
    () => searchBankCatalog(query, countryCode),
    [countryCode, query],
  );

  const selectCountry = (nextCountryCode: string) => {
    onCountryChange(nextCountryCode);
    onCurrencyChange(getCountryCatalog(nextCountryCode).currency as Currency);
  };

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto bg-background px-5 pb-safe-offset-6 pt-safe-offset-5 text-foreground">
      <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <header className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[15px] font-black tracking-[-0.035em]">SheetLog</p>
            <p className="text-[10px] font-semibold text-muted-foreground">One tiny win to begin</p>
          </div>
        </div>
        <span className="rounded-full border border-border/75 bg-card px-3 py-1.5 text-[10px] font-bold text-muted-foreground">
          No sign-in
        </span>
      </header>

      <section className="relative z-10 mt-9">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
          Start in one tap
        </p>
        <h1 className="mt-2 max-w-[330px] text-[clamp(2rem,9vw,2.65rem)] font-black leading-[0.98] tracking-[-0.06em]">
          What do you usually pay with?
        </h1>
        <p className="mt-3 max-w-sm text-[13px] leading-5 text-muted-foreground">
          Pick one primary account. You can add every other account after your first log.
        </p>
      </section>

      <section className="relative z-10 mt-6">
        <button
          type="button"
          aria-expanded={showLocaleControls}
          onClick={() => setShowLocaleControls((current) => !current)}
          className="flex w-full items-center gap-3 rounded-[20px] border border-border/75 bg-surface px-3.5 py-3 text-left active:bg-surface-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
            <Landmark className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[13px] font-bold">
              {catalog.name} · {currency}
            </strong>
            <small className="mt-0.5 block text-[10px] font-medium text-muted-foreground">
              Suggested from your device language and timezone
            </small>
          </span>
          <span className="text-[11px] font-bold text-primary">Change</span>
        </button>

        {showLocaleControls ? (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-[20px] border border-border/75 bg-card p-3">
            <label className="min-w-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Country
              <select
                aria-label="Country"
                value={catalog.code}
                onChange={(event) => selectCountry(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-[13px] border border-border bg-background px-3 text-[13px] font-semibold text-foreground"
              >
                {SUPPORTED_COUNTRY_CODES.map((code) => {
                  const option = getCountryCatalog(code);
                  return (
                    <option key={code} value={code}>
                      {option.name}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="min-w-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Currency
              <select
                aria-label="Currency"
                value={currency}
                onChange={(event) =>
                  onCurrencyChange(event.target.value as Currency)
                }
                className="mt-1.5 h-11 w-full rounded-[13px] border border-border bg-background px-3 text-[13px] font-semibold text-foreground"
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <p className="col-span-2 px-1 text-[10px] leading-4 text-muted-foreground">
              Country controls featured banks. Currency controls transaction defaults, so they can stay different.
            </p>
          </div>
        ) : null}
      </section>

      <section className="relative z-10 mt-6">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-black">Popular near you</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Tap your everyday account</p>
          </div>
          <span className="text-[10px] font-bold text-muted-foreground">8 banks</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {catalog.banks.slice(0, 8).map((bank) => (
            <BankTile
              key={bank.id}
              bank={bank}
              subtitle="Primary account"
              testId="featured-bank"
              disabled={isSelecting}
              onClick={() => onSelectBank(bank, catalog.code)}
            />
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <BankTile
            bank={CASH_ACCOUNT}
            subtitle="Notes & coins"
            disabled={isSelecting}
            onClick={() => onSelectBank(CASH_ACCOUNT, catalog.code)}
          />
          <button
            type="button"
            disabled={isSelecting}
            onClick={() => setShowSearch(true)}
            className="flex min-h-[78px] min-w-0 items-center gap-3 rounded-[21px] border border-dashed border-border bg-transparent px-3 py-3 text-left transition active:scale-[0.985] active:bg-surface-2 disabled:opacity-55"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-primary/10 text-primary">
              <Search className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px] font-bold">Other bank</strong>
              <small className="mt-1 block truncate text-[10px] font-medium text-muted-foreground">
                Search globally
              </small>
            </span>
          </button>
        </div>
      </section>

      <div className="relative z-10 mt-auto flex items-center justify-center gap-2 pb-1 pt-7 text-center text-[10px] leading-4 text-muted-foreground">
        <WalletCards className="h-4 w-4 shrink-0 text-primary" />
        <span>Nothing connects to your bank. This only names your SheetLog account.</span>
      </div>

      {showSearch ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/60 p-3 backdrop-blur-sm sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Search every bank"
            className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-border bg-background pb-safe"
          >
            <header className="flex items-center gap-3 border-b border-border/75 px-4 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
                <Search className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-black tracking-[-0.03em]">Find your bank</h2>
                <p className="text-[10px] text-muted-foreground">Names, abbreviations, and local aliases work</p>
              </div>
              <button
                type="button"
                aria-label="Close bank search"
                onClick={() => {
                  setShowSearch(false);
                  setQuery("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search every bank"
                  className="h-12 w-full rounded-[16px] border border-border bg-surface pl-10 pr-4 text-[14px] font-semibold placeholder:font-medium placeholder:text-muted-foreground"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {query.trim() && results.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-border p-6 text-center">
                  <p className="text-[13px] font-bold">No matching bank yet</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    Use Cash for now, then rename or add an account from Settings.
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                {results.map((result) => (
                  <button
                    key={`${result.countryCode}:${result.bank.id}`}
                    type="button"
                    disabled={isSelecting}
                    onClick={() => onSelectBank(result.bank, result.countryCode)}
                    className="flex w-full items-center gap-3 rounded-[18px] border border-border/75 bg-card p-3 text-left active:bg-surface-2"
                  >
                    <BankMark bank={result.bank} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[13px] font-bold">{result.bank.name}</strong>
                      <small className="mt-1 block truncate text-[10px] text-muted-foreground">
                        {result.countryName} · {result.currency}
                      </small>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
