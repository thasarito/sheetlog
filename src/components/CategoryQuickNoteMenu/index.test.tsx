import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CategoryQuickNoteMenu,
  type CategoryQuickNoteMenuState,
} from './index';

function createState(
  activeTarget: CategoryQuickNoteMenuState['activeTarget'] = null,
): CategoryQuickNoteMenuState {
  return {
    category: 'Food',
    presentation: {
      label: 'Food',
      icon: 'Utensils',
      color: '#f97316',
    },
    anchor: {
      element: document.createElement('button'),
      bounds: {
        left: 40,
        top: 520,
        right: 120,
        bottom: 600,
        width: 80,
        height: 80,
      },
    },
    customNotes: [
      {
        id: 'custom-1',
        icon: 'Salad',
        label: 'Custom one',
        note: 'custom one',
        color: '#22c55e',
      },
      {
        id: 'custom-2',
        icon: 'Coffee',
        label: 'Custom two',
        note: 'custom two',
      },
    ],
    defaultNotes: [
      {
        id: 'default-1',
        icon: 'House',
        label: 'Default one',
        note: 'default one',
        color: '#3b82f6',
      },
      {
        id: 'default-2',
        icon: 'Briefcase',
        label: 'Default two',
        note: 'default two',
      },
    ],
    isGestureActive: false,
    hasLeftAnchor: false,
    dragPosition: null,
    activeTarget,
  };
}

function renderMenu(state = createState()) {
  return render(
    <CategoryQuickNoteMenu
      state={state}
      onDismiss={vi.fn()}
      onSelectNote={vi.fn()}
      onUseCategory={vi.fn()}
    />,
  );
}

describe('CategoryQuickNoteMenu tethered presentation', () => {
  it('uses a curved tether instead of an arrow tip and keeps action surfaces neutral', () => {
    renderMenu();

    const dialog = screen.getByRole('dialog', { name: 'Food quick notes' });
    const tether = screen.getByTestId('category-menu-tether');
    const path = tether.querySelector('path');
    const anchorDot = tether.querySelector('circle');

    expect(path).toHaveAttribute('d', expect.stringMatching(/^M .+ C .+/));
    expect(anchorDot).toBeInTheDocument();
    expect(dialog.querySelector('[data-category-menu-tip]')).not.toBeInTheDocument();
    expect(dialog.querySelector('.rotate-45')).not.toBeInTheDocument();

    const customNote = within(dialog).getByRole('button', { name: 'Custom one' });
    expect(customNote).toHaveAttribute('data-category-menu-row', 'custom');
    expect(
      customNote.querySelector('[data-category-menu-active-rail]'),
    ).toBeInTheDocument();
    expect(customNote.getAttribute('style') ?? '').not.toMatch(
      /background|border/i,
    );

    const defaultNote = within(dialog).getByRole('button', {
      name: 'Default one',
    });
    expect(defaultNote).toHaveAttribute(
      'data-category-menu-default-action',
      'true',
    );
    expect(defaultNote.getAttribute('style') ?? '').not.toMatch(
      /background|border/i,
    );
  });

  it('exposes the drag target as a lightweight state for rails and dock indicators', () => {
    const { rerender } = renderMenu(
      createState({ type: 'note', source: 'custom', id: 'custom-1' }),
    );

    let dialog = screen.getByRole('dialog', { name: 'Food quick notes' });
    expect(
      within(dialog).getByRole('button', { name: 'Custom one' }),
    ).toHaveAttribute('data-active', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'Custom two' }),
    ).toHaveAttribute('data-active', 'false');

    rerender(
      <CategoryQuickNoteMenu
        state={createState({
          type: 'note',
          source: 'default',
          id: 'default-2',
        })}
        onDismiss={vi.fn()}
        onSelectNote={vi.fn()}
        onUseCategory={vi.fn()}
      />,
    );

    dialog = screen.getByRole('dialog', { name: 'Food quick notes' });
    expect(
      within(dialog).getByRole('button', { name: 'Default two' }),
    ).toHaveAttribute('data-active', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'Default one' }),
    ).toHaveAttribute('data-active', 'false');
  });
});
