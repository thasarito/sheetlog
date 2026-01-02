import Link from "next/link";
import { TransactionFlow } from "../components/TransactionFlow";

export default function HomePage() {
  return (
    <div className="relative h-full w-full">
      <TransactionFlow />
      <footer className="absolute bottom-3 left-0 right-0 flex justify-center text-[11px] text-muted-foreground">
        <Link
          className="transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href="/privacy"
        >
          Privacy policy
        </Link>
      </footer>
    </div>
  );
}
