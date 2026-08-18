import { createContext, useContext } from "react";

export const DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT = 104;
export const TRANSACTION_HISTORY_DOCK_GAP = 8;

export type CategoryStepSheetAccessoryContextValue = {
  provided: boolean;
  host: HTMLDivElement | null;
  reportHeight: (height: number) => void;
  requestExpanded: () => void;
};

const CategoryStepSheetAccessoryContext =
  createContext<CategoryStepSheetAccessoryContextValue>({
    provided: false,
    host: null,
    reportHeight: () => undefined,
    requestExpanded: () => undefined,
  });

export const CategoryStepSheetAccessoryProvider =
  CategoryStepSheetAccessoryContext.Provider;

export function useCategoryStepSheetAccessory() {
  return useContext(CategoryStepSheetAccessoryContext);
}
