import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCategoryQuickNoteMenu } from './useCategoryQuickNoteMenu';

function anchorBounds() {
  return {
    left: 40,
    top: 520,
    right: 120,
    bottom: 600,
    width: 80,
    height: 80,
  };
}

describe('useCategoryQuickNoteMenu anchor presentation', () => {
  it('uses CSS-driven low-emphasis styling instead of filling and outlining the tile', () => {
    const anchor = document.createElement('button');
    const { result } = renderHook(() =>
      useCategoryQuickNoteMenu({
        getCustomNotes: () => [],
        getDefaultNotes: () => [],
        getCategoryPresentation: () => ({
          label: 'Food',
          icon: 'Utensils',
          color: '#f97316',
        }),
        onSelectNote: vi.fn(),
        onUseCategory: vi.fn(),
      }),
    );

    act(() => {
      result.current.handlers.onLongPressStart(
        'Food',
        { x: 80, y: 560 },
        { element: anchor, bounds: anchorBounds() },
      );
    });

    expect(anchor).toHaveAttribute('data-category-quick-note-open', 'true');
    expect(anchor.style.borderColor).toBe('');
    expect(anchor.style.backgroundColor).toBe('');
    expect(anchor.style.outline).toBe('');
    expect(
      anchor.style.getPropertyValue('--category-quick-note-anchor-accent'),
    ).toBe('#f97316');

    act(() => result.current.handlers.onDismiss());

    expect(anchor).not.toHaveAttribute('data-category-quick-note-open');
    expect(
      anchor.style.getPropertyValue('--category-quick-note-anchor-accent'),
    ).toBe('');
  });
});
