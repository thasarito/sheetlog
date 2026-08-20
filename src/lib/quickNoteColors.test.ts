import { describe, expect, it } from 'vitest';
import {
  getAutomaticQuickNoteColor,
  isValidQuickNoteColor,
  QUICK_NOTE_COLOR_PALETTE,
  resolveQuickNoteColors,
} from './quickNoteColors';

describe('Quick Note colors', () => {
  it('preserves explicit colors and assigns distinct automatic colors', () => {
    const resolved = resolveQuickNoteColors([
      { id: 'apple-pay' },
      { id: 'privileges' },
      { id: 'promptpay', color: '#123456' },
      { id: 'cash' },
    ]);

    expect(resolved[2]?.color).toBe('#123456');
    expect(new Set(resolved.map(({ color }) => color))).toHaveSize(resolved.length);
    expect(
      resolved
        .filter(({ id }) => id !== 'promptpay')
        .every(({ color }) => QUICK_NOTE_COLOR_PALETTE.includes(color)),
    ).toBe(true);
  });

  it('keeps automatic colors stable when notes are reordered', () => {
    const first = resolveQuickNoteColors([
      { id: 'apple-pay' },
      { id: 'privileges' },
      { id: 'cash' },
    ]);
    const second = resolveQuickNoteColors([
      { id: 'cash' },
      { id: 'apple-pay' },
      { id: 'privileges' },
    ]);

    expect(Object.fromEntries(first.map(({ id, color }) => [id, color]))).toEqual(
      Object.fromEntries(second.map(({ id, color }) => [id, color])),
    );
  });

  it('falls back from invalid stored colors to a stable palette color', () => {
    const [resolved] = resolveQuickNoteColors([
      { id: 'invalid-color', color: 'tomato' },
    ]);

    expect(isValidQuickNoteColor('tomato')).toBe(false);
    expect(resolved?.color).toBe(getAutomaticQuickNoteColor('invalid-color'));
    expect(QUICK_NOTE_COLOR_PALETTE).toContain(resolved?.color);
  });
});
