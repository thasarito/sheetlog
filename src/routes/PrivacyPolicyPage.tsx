import { LegalLayout } from "../components/LegalLayout";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function PrivacyPolicyPage() {
  useDocumentMeta({
    title: "Privacy Policy | SheetLog",
    description: "Privacy Policy for SheetLog.",
  });

  return (
    <LegalLayout>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Effective date: 2026-08-17
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">Overview</h2>
        <p>
          SheetLog is a client-side app that lets you log transactions directly
          into a Google Sheet in your own Google account. We do not run a
          backend server for storing your data.
        </p>
        <p>
          When analytics include more than one currency, SheetLog sends only
          currency codes and bounded date ranges to Frankfurter to retrieve
          historical reference rates. Transaction amounts, categories,
          accounts, notes, Google identifiers, and spreadsheet contents are not
          sent.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Information we collect
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Google OAuth access tokens so the app can access the Google Sheets
            and Drive APIs on your behalf.
          </li>
          <li>
            Spreadsheet data you enter, such as transactions, categories,
            accounts, dates, and notes, which are stored in your Google Sheet.
          </li>
          <li>
            Local app data stored in your browser (IndexedDB and localStorage),
            including offline transactions, your selected sheet ID, the stable
            Google account identifier used to keep offline queues separated,
            and display preferences.
          </li>
          <li>
            If you allow your browser&apos;s location request while creating an
            expense, precise location may be sent directly from your browser to
            Google Maps to suggest nearby places. When typing at least two
            characters in an eligible transaction note, the note query is sent
            directly from your browser to Google Maps for autocomplete place
            suggestions.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Google Maps place suggestions
        </h2>
        <p>
          Google processes the location and search information used for nearby
          places and autocomplete. Google also receives ordinary network data,
          including your IP address, with these requests. Google handles this
          information under the{" "}
          <a
            className="underline underline-offset-2"
            href="https://policies.google.com/privacy"
          >
            Google Privacy Policy
          </a>
          . Your browser controls the browser&apos;s location permission prompt;
          SheetLog does not add a separate in-app location consent flow.
        </p>
        <p>
          SheetLog temporarily processes raw coordinates, transaction-note query
          text, and returned suggestions in browser memory. It clears them when
          the Places session closes or shortly afterward. SheetLog does not
          persist raw coordinates, formatted addresses, search history, or
          unselected place suggestions.
        </p>
        <p>
          When you select a place, SheetLog stores the selected place display
          name, provider, and Place ID locally for offline sync and in your
          Google Sheet. The Place ID is the stable place reference, and the
          display name remains your transaction note. These statements describe
          SheetLog&apos;s processing and persistence; Google&apos;s handling is governed
          by its own policy.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          How we use information
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Create or locate a Google Sheet in your Drive.</li>
          <li>Write your transactions and settings to that sheet.</li>
          <li>Store offline entries locally until they are synced.</li>
          <li>Retrieve historical reference rates for multi-currency analytics.</li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Data sharing and transfers
        </h2>
        <p>
          We do not sell your data. Data is sent directly from your browser to
          Google APIs to read or write your sheet and, when you use the Places
          picker, to provide Google Maps place suggestions. For multi-currency
          analytics, the bounded currency-code and date-range request described
          above is sent directly to Frankfurter; transaction contents are not
          included.
        </p>
        <p>
          Our use and transfer of information received from Google APIs adheres
          to the Google API Services User Data Policy, including the Limited Use
          requirements.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Data retention and deletion
        </h2>
        <p>
          Transaction data is stored in your Google Sheet and in your browser
          for offline access. You can delete local data at any time by clearing
          site data in your browser. You can revoke the app&apos;s access via your
          Google Account security settings.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>
          If you have questions about this policy, contact{" "}
          <span className="font-medium">support@thasarito.com</span>.
        </p>
      </section>
    </LegalLayout>
  );
}
