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
          Effective date: 2026-01-01
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">Overview</h2>
        <p>
          SheetLog is a client-side app that lets you log transactions directly
          into a Google Sheet in your own Google account. We do not run a
          backend server for storing your data.
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
            including offline transactions, your selected sheet ID, and display
            preferences.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          How we use information
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Create or locate a Google Sheet in your Drive.</li>
          <li>Write your transactions and settings to that sheet.</li>
          <li>Store offline entries locally until they are synced.</li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Data sharing and transfers
        </h2>
        <p>
          We do not sell or share your data with third parties. Data is sent
          directly from your browser to Google APIs to read or write your sheet.
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
