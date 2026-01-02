import { LegalLayout } from "../components/LegalLayout";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function TermsPage() {
  useDocumentMeta({
    title: "Terms of Service | SheetLog",
    description: "Terms of Service for SheetLog.",
  });

  return (
    <LegalLayout>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Effective date: 2026-01-01
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">Acceptance</h2>
        <p>
          By using SheetLog, you agree to these terms. If you do not agree, do
          not use the service.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Service description
        </h2>
        <p>
          SheetLog helps you record financial transactions and sync them to a
          Google Sheet in your Google account. The app runs in your browser and
          uses Google APIs to write data to your sheet.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Your responsibilities
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You are responsible for the accuracy of the data you enter and for
            securing access to your Google account.
          </li>
          <li>
            You may only use the service in compliance with applicable laws and
            Google&apos;s terms.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Availability and changes
        </h2>
        <p>
          We may modify, suspend, or discontinue the service at any time. We may
          update these terms, and continued use of the service means you accept
          the updated terms.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">
          Disclaimers and limitation of liability
        </h2>
        <p>
          The service is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. To the fullest extent permitted by law, we
          disclaim warranties of any kind and will not be liable for any
          indirect, incidental, or consequential damages arising from your use
          of the service.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-6 text-foreground/90">
        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>
          For questions about these terms, contact{" "}
          <span className="font-medium">support@thasarito.com</span>.
        </p>
      </section>
    </LegalLayout>
  );
}
