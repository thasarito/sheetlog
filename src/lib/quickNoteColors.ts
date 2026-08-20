import { COLOR_PALETTE } from '../theme/themeConfig';

const DISTINCT_COLOR_NAMES = [
  'Blue',
  'Purple',
  'Teal',
  'Amber',
  'Rose',
  'Green',
  'Pink',
  'Indigo',
] as const;

export const QUICK_NOTE_COLOR_PALETTE = DISTINCT_COLOR_NAMES.map((name) => {
  const option = COLOR_PALETTE.find((candidate) => candidate.name === name);
  if (!option) throw new Error(`Missing Quick Note color palette option: ${name}`);
  return option.value;
});

export type QuickNoteColorSource = {
  id: string;
  color?: string;
};

export type ResolvedQuickNoteColor<T extends QuickNoteColorSource> = T & {
  color: string;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isValidQuickNoteColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function getAutomaticQuickNoteColor(id: string): string {
  return QUICK_NOTE_COLOR_PALETTE[
    hashString(id) % QUICK_NOTE_COLOR_PALETTE.length
  ];
}

export function resolveQuickNoteColors<T extends QuickNoteColorSource>(
  notes: readonly T[],
): Array<ResolvedQuickNoteColor<T>> {
  const usedPaletteIndexes = new Set<number>();
  for (const note of notes) {
    if (!isValidQuickNoteColor(note.color)) continue;
    const paletteIndex = QUICK_NOTE_COLOR_PALETTE.findIndex(
      (color) => color.toLowerCase() === note.color.toLowerCase(),
    );
    if (paletteIndex >= 0) usedPaletteIndexes.add(paletteIndex);
  }

  const automaticAssignments = new Map<string, string>();
  const automaticIds = Array.from(
    new Set(
      notes
        .filter((note) => !isValidQuickNoteColor(note.color))
        .map((note) => note.id),
    ),
  ).sort();

  for (const id of automaticIds) {
    let paletteIndex = hashString(id) % QUICK_NOTE_COLOR_PALETTE.length;
    for (let attempt = 0; attempt < QUICK_NOTE_COLOR_PALETTE.length; attempt += 1) {
      if (!usedPaletteIndexes.has(paletteIndex)) break;
      paletteIndex = (paletteIndex + 1) % QUICK_NOTE_COLOR_PALETTE.length;
    }
    usedPaletteIndexes.add(paletteIndex);
    automaticAssignments.set(id, QUICK_NOTE_COLOR_PALETTE[paletteIndex]);
  }

  return notes.map((note) => ({
    ...note,
    color: isValidQuickNoteColor(note.color)
      ? note.color
      : automaticAssignments.get(note.id) ?? getAutomaticQuickNoteColor(note.id),
  }));
}

export function resolveQuickNoteColor<T extends QuickNoteColorSource>(
  note: T,
): ResolvedQuickNoteColor<T> {
  return resolveQuickNoteColors([note])[0];
}
