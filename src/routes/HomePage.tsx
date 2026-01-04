import { TransactionFlow } from "../components/TransactionFlow";

import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function HomePage() {
  useDocumentMeta({
    title: "SheetLog",
    description: "Rapid financial logging to Google Sheets",
  });

  return (
    <div className="relative h-full w-full flex flex-col">
      <div className="flex-1">
        <TransactionFlow />
      </div>
    </div>
  );
}
