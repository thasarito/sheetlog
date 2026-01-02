import { Link } from "@tanstack/react-router";
import { TransactionFlow } from "../components/TransactionFlow";
import { AuthUserProfile } from "../components/AuthUserProfile";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function HomePage() {
  useDocumentMeta({
    title: "SheetLog",
    description: "Rapid financial logging to Google Sheets",
  });

  return (
    <div className="relative h-full w-full flex flex-col">
      <AuthUserProfile />
      <div className="flex-1">
        <TransactionFlow />
      </div>
      <footer className="flex my-2 justify-center text-[11px] text-muted-foreground">
        <Link
          className="transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          to="/privacy"
        >
          Privacy policy
        </Link>
      </footer>
    </div>
  );
}
