import type { TransactionHistoryListItem } from './TransactionHistoryItems';

export function findStickyTransactionDateIndex(
  items: readonly TransactionHistoryListItem[],
  firstVisibleIndex: number | undefined,
  scrollTop: number,
  getOffset: (index: number) => number | undefined,
): number | null {
  if (
    firstVisibleIndex === undefined ||
    scrollTop <= 0.5 ||
    items.length === 0
  ) {
    return null;
  }

  let index = Math.min(Math.max(firstVisibleIndex, 0), items.length - 1);
  while (index >= 0 && items[index]?.kind !== 'date') {
    index -= 1;
  }
  if (index < 0) return null;

  const offset = getOffset(index);
  if (offset === undefined || offset > scrollTop + 0.5) return null;
  return index;
}
