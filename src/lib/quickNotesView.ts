import type { QuickNotesConfig } from './types';

export type QuickNotesProvenance = 'scoped' | 'legacy' | 'empty';

export interface QuickNotesQuerySnapshot {
  config: QuickNotesConfig;
  provenance: QuickNotesProvenance;
}

export function createQuickNotesQuerySnapshot(
  scoped: QuickNotesConfig | null,
  legacy: QuickNotesConfig | null,
): QuickNotesQuerySnapshot {
  if (scoped !== null) {
    return { config: scoped, provenance: 'scoped' };
  }
  const config = legacy ?? {};
  return {
    config,
    provenance: Object.keys(config).length > 0 ? 'legacy' : 'empty',
  };
}
