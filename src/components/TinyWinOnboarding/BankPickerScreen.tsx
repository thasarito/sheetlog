import { Landmark, Loader2, LogIn, Search, X } from "lucide-react";
import { type ChangeEvent, type CSSProperties, useMemo, useState } from "react";
import {
  type BankInstitution,
  getCountryCatalog,
  searchBankCatalog,
  SUPPORTED_COUNTRY_CODES,
  SUPPORTED_CURRENCIES,
} from "../../lib/bankCatalog";
import type { Currency } from "../../lib/currencies";
import { PlayfulMascot } from "./PlayfulMascot";
import { SheetLogLogo } from "./SheetLogLogo";

const CASH_ACCOUNT: BankInstitution = {
  id: "cash",
  name: "Cash",
  mark: "¤",
  color: "#2f8f4e",
  aliases: [],
};

type BankPickerScreenProps = {
  countryCode: string;
  currency: Currency;
  isSelecting?: boolean;
  isConnecting?: boolean;
  onCountryChange: (countryCode: string) => void;
  onCurrencyChange: (currency: Currency) => void;
  onSelectBank: (bank: BankInstitution, countryCode: string) => void;
  onSignIn?: () => void;
};

function BankMark({ bank }: { bank: BankInstitution }) {
  return (
    <span
      aria-hidden="true"
      className="tiny-win-bank-mark"
      style={{ "--bank-color": bank.color } as CSSProperties}
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
      data-playful-pressable="true"
      disabled={disabled}
      onClick={onClick}
      className="tiny-win-bank-tile"
    >
      <BankMark bank={bank} />
      <span className="tiny-win-bank-copy">
        <strong>{bank.name}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="tiny-win-bank-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

export function BankPickerScreen({
  countryCode,
  currency,
  isSelecting = false,
  isConnecting = false,
  onCountryChange,
  onCurrencyChange,
  onSelectBank,
  onSignIn,
}: BankPickerScreenProps) {
  const [showLocaleControls, setShowLocaleControls] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const catalog = getCountryCatalog(countryCode);
  const results = useMemo(
    () => searchBankCatalog(query, countryCode),
    [countryCode, query],
  );
  const disabled = isSelecting || isConnecting;

  const selectCountry = (nextCountryCode: string) => {
    onCountryChange(nextCountryCode);
    onCurrencyChange(getCountryCatalog(nextCountryCode).currency as Currency);
  };

  return (
    <main className="tiny-win-playful">
      <div className="tiny-win-playful-screen">
        <header className="tiny-win-topbar">
          <div className="tiny-win-brand">
            <SheetLogLogo className="tiny-win-brand-logo" />
            <span>SheetLog</span>
          </div>
          {onSignIn ? (
            <button
              type="button"
              aria-label="Already use SheetLog? Sign in with Google"
              disabled={disabled}
              onClick={onSignIn}
              className="tiny-win-sign-in"
            >
              {isConnecting ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <LogIn aria-hidden="true" className="h-3.5 w-3.5" />
                  Sign in
                </span>
              )}
            </button>
          ) : null}
        </header>

        <PlayfulMascot />

        <section className="tiny-win-copy">
          <p className="tiny-win-eyebrow">Step 1 of 2 · Make it yours</p>
          <h1 className="tiny-win-title">Which account is your everyday one?</h1>
          <p className="tiny-win-lead">
            Pick it once. SheetLog will remember the rest.
          </p>
        </section>

        <button
          type="button"
          aria-expanded={showLocaleControls}
          aria-haspopup="dialog"
          onClick={() => setShowLocaleControls(true)}
          className="tiny-win-locale-button"
        >
          <span className="tiny-win-locale-icon" aria-hidden="true">
            <Landmark className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <strong>
              {catalog.name} · {currency}
            </strong>
            <small>{currency} default currency</small>
          </span>
          <span className="tiny-win-locale-change">Change</span>
        </button>

        <section>
          <div className="tiny-win-section-heading">
            <strong>Popular near you</strong>
            <span>Tap one to continue</span>
          </div>
          <div className="tiny-win-bank-grid">
            {catalog.banks.slice(0, 8).map((bank) => (
              <BankTile
                key={bank.id}
                bank={bank}
                subtitle="Tap to pick"
                testId="featured-bank"
                disabled={disabled}
                onClick={() => onSelectBank(bank, catalog.code)}
              />
            ))}
          </div>

          <div className="tiny-win-secondary-grid">
            <BankTile
              bank={CASH_ACCOUNT}
              subtitle="Notes and coins"
              disabled={disabled}
              onClick={() => onSelectBank(CASH_ACCOUNT, catalog.code)}
            />
            <button
              type="button"
              data-playful-pressable="true"
              disabled={disabled}
              onClick={() => setShowSearch(true)}
              className="tiny-win-secondary-tile"
            >
              <span
                className="tiny-win-bank-mark"
                style={{ "--bank-color": "#2f8f4e" } as CSSProperties}
                aria-hidden="true"
              >
                ⌕
              </span>
              <span className="tiny-win-bank-copy">
                <strong>Other bank</strong>
                <small>Search the catalog</small>
              </span>
              <span className="tiny-win-bank-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </section>

        <p className="tiny-win-trust">
          No account connection. This only names your first SheetLog account.
        </p>
      </div>

      {showLocaleControls ? (
        <div className="tiny-win-sheet-backdrop" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Country and currency"
            className="tiny-win-sheet"
          >
            <header className="tiny-win-sheet-header">
              <div>
                <p className="tiny-win-eyebrow">Detection settings</p>
                <h2>Country and currency</h2>
              </div>
              <button
                type="button"
                aria-label="Close country and currency"
                className="tiny-win-sheet-close"
                onClick={() => setShowLocaleControls(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <p className="tiny-win-lead text-left">
              Country ranks nearby banks. Currency controls transaction defaults.
            </p>
            <div className="tiny-win-field-grid">
              <label className="tiny-win-field">
                Bank country
                <select
                  aria-label="Country"
                  value={catalog.code}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    selectCountry(event.target.value)
                  }
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
              <label className="tiny-win-field">
                Default currency
                <select
                  aria-label="Currency"
                  value={currency}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onCurrencyChange(event.target.value as Currency)
                  }
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="tiny-win-primary-button"
              onClick={() => setShowLocaleControls(false)}
            >
              Use these settings
            </button>
          </section>
        </div>
      ) : null}

      {showSearch ? (
        <div className="tiny-win-sheet-backdrop" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Search every bank"
            className="tiny-win-sheet"
          >
            <header className="tiny-win-sheet-header">
              <div>
                <p className="tiny-win-eyebrow">Global catalog</p>
                <h2>Find another bank</h2>
              </div>
              <button
                type="button"
                aria-label="Close bank search"
                className="tiny-win-sheet-close"
                onClick={() => {
                  setShowSearch(false);
                  setQuery("");
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="tiny-win-search-wrap">
              <Search aria-hidden="true" />
              <input
                aria-label="Search every bank"
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setQuery(event.target.value)
                }
                placeholder="Search every bank"
                className="tiny-win-search-field"
              />
            </div>
            {query.trim() && results.length === 0 ? (
              <p className="tiny-win-trust">
                No match yet. Try the bank’s full name or an abbreviation.
              </p>
            ) : null}
            <div className="tiny-win-search-results">
              {results.map((result) => (
                <button
                  key={`${result.countryCode}:${result.bank.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onSelectBank(result.bank, result.countryCode)
                  }
                  className="tiny-win-search-result"
                  aria-label={`${result.bank.name}, ${result.countryName}`}
                >
                  <BankMark bank={result.bank} />
                  <span className="tiny-win-bank-copy">
                    <strong>{result.bank.name}</strong>
                    <small>
                      {result.countryName} · {result.currency}
                    </small>
                  </span>
                  <span className="tiny-win-bank-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
