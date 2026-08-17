import { format } from "date-fns";
import { parseDate } from "../../lib/date-utils";
import type { TransactionRecord } from "../../lib/types";
import { cn } from "../../lib/utils";

type TransactionRowProps = {
  transaction: TransactionRecord;
  itemId?: string;
  onSelect?: (transaction: TransactionRecord) => void;
};

export function TransactionRow({
  transaction,
  itemId,
  onSelect,
}: TransactionRowProps) {
  const amount = Number(transaction.amount);
  const symbol =
    transaction.currency === "THB"
      ? "฿"
      : transaction.currency === "USD"
        ? "$"
        : transaction.currency;
  const displayAmount = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
  });

  return (
    <button
      type="button"
      data-item-id={itemId}
      onClick={() => onSelect?.(transaction)}
      aria-label={`${format(parseDate(transaction.date), "HH:mm")} ${transaction.type} ${transaction.category}${transaction.note ? ` ${transaction.note}` : ""} ${symbol}${displayAmount}`}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="w-9 text-xs font-medium tabular-nums text-muted-foreground">
        {format(parseDate(transaction.date), "HH:mm")}
      </span>
      <span className="flex min-w-0 items-center gap-2 pr-2">
        <span className="truncate font-medium text-foreground">
          {transaction.category}
          {transaction.note ? (
            <span className="ml-1 font-normal text-muted-foreground">
              - {transaction.note}
            </span>
          ) : null}
        </span>
      </span>
      <span
        className={cn(
          "whitespace-nowrap font-medium tabular-nums",
          transaction.type === "income"
            ? "text-emerald-500"
            : transaction.type === "expense"
              ? "text-foreground"
              : "text-blue-500",
        )}
      >
        {transaction.type === "expense" ? "" : "+"}
        {symbol}
        {displayAmount}
      </span>
    </button>
  );
}
