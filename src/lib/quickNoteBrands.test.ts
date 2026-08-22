import { describe, expect, it } from 'vitest';
import type { QuickNote } from './types';
import {
  prepareQuickNotesForPersistence,
  resolveQuickNoteBrandName,
  resolveQuickNoteForPresentation,
  resolveQuickNoteIconName,
} from './quickNoteBrands';

describe('Quick Note brand resolution', () => {
  it.each([
    ['grab: pagoda coffee', 'brand:grab'],
    ['ChatGPT Plus', 'brand:chatgpt'],
    ['pea', 'brand:pea'],
    ['Spotify', 'brand:spotify'],
    ['7-11:', 'brand:7-eleven'],
    ['M Flow', 'brand:m-flow'],
    ['shoppee', 'brand:shopee'],
  ])('matches %s to %s', (label, expected) => {
    expect(resolveQuickNoteBrandName(label)).toBe(expected);
  });

  it('prefers specific Apple services before Apple', () => {
    expect(resolveQuickNoteBrandName('apple pay')).toBe('brand:apple-pay');
    expect(resolveQuickNoteBrandName('icloud storage')).toBe('brand:icloud');
    expect(resolveQuickNoteBrandName('apple')).toBe('brand:apple');
  });

  it('resolves a legacy placeholder without changing a valid explicit icon', () => {
    expect(resolveQuickNoteIconName('StickyNote', 'grab')).toBe('brand:grab');
    expect(resolveQuickNoteIconName('Coffee', '7-11')).toBe('Coffee');
    expect(resolveQuickNoteIconName('brand:spotify', 'grab')).toBe('brand:spotify');
  });

  it('uses the requested fallback when no safe brand match exists', () => {
    expect(resolveQuickNoteIconName('StickyNote', 'unknown merchant', 'Tag')).toBe('Tag');
    expect(resolveQuickNoteIconName(undefined, '', 'Wallet')).toBe('Wallet');
  });

  it('restores a presentation-only match before reorder persistence', () => {
    const storedNote: QuickNote = {
      id: 'grab',
      icon: 'StickyNote',
      label: 'grab',
    };
    const presentationNote = resolveQuickNoteForPresentation(storedNote);

    expect(presentationNote.icon).toBe('brand:grab');
    expect(prepareQuickNotesForPersistence([presentationNote])[0]?.icon).toBe(
      'StickyNote',
    );

    const explicitlySavedNote = { ...presentationNote };
    expect(prepareQuickNotesForPersistence([explicitlySavedNote])[0]?.icon).toBe(
      'brand:grab',
    );
  });
});
