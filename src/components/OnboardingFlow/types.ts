import type { TransactionType } from '../../lib/types';

export type LocationMode = 'root' | 'folder';

export type CategoryInputs = Record<TransactionType, string>;

export type ScreenMeta = {
  stepLabel: string;
  stepNumber: number;
  totalSteps: number;
  progressPercent: number;
};
