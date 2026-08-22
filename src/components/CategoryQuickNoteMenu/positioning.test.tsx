import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CategoryQuickNoteMenu,
  type CategoryQuickNoteMenuState,
} from './index';

type AnchorBounds = CategoryQuickNoteMenuState['anchor']['bounds'];

const originalViewport = {
  width: window.innerWidth,
  height: window.innerHeight,
};

function setViewport(width: number, height: number) {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
}

function createState(anchorBounds: AnchorBounds): CategoryQuickNoteMenuState {
  return {
    category: 'Food',
    presentation: {
      label: 'Food',
      icon: 'Utensils',
      color: '#f97316',
    },
    anchor: {
      element: document.createElement('button'),
      bounds: anchorBounds,
    },
    customNotes: [],
    defaultNotes: [],
    isGestureActive: true,
    hasLeftAnchor: false,
    dragPosition: null,
    activeTarget: null,
  };
}

function renderAt(anchorBounds: AnchorBounds) {
  render(
    <CategoryQuickNoteMenu
      state={createState(anchorBounds)}
      onDismiss={vi.fn()}
      onSelectNote={vi.fn()}
      onUseCategory={vi.fn()}
    />,
  );
  return screen.getByRole('dialog', { name: 'Food quick notes' });
}

afterEach(() => {
  setViewport(originalViewport.width, originalViewport.height);
});

describe('CategoryQuickNoteMenu top-row reachability', () => {
  it.each([
    [
      'left-side',
      { left: 120, top: 80, right: 200, bottom: 160, width: 80, height: 80 },
      '72px',
    ],
    [
      'right-side',
      { left: 600, top: 80, right: 680, bottom: 160, width: 80, height: 80 },
      '408px',
    ],
  ])(
    'biases a %s top-row menu sideways toward the viewport centre',
    (_label, anchorBounds, expectedLeft) => {
      setViewport(800, 800);
      const dialog = renderAt(anchorBounds);

      expect(dialog).toHaveAttribute('data-placement', 'below');
      expect(dialog.style.left).toBe(expectedLeft);
    },
  );

  it('keeps a lower-row menu centred when it opens above the source', () => {
    setViewport(800, 800);
    const dialog = renderAt({
      left: 360,
      top: 520,
      right: 440,
      bottom: 600,
      width: 80,
      height: 80,
    });

    expect(dialog).toHaveAttribute('data-placement', 'above');
    expect(dialog.style.left).toBe('240px');
  });

  it('still clamps a side-biased top-row menu to the viewport margin', () => {
    setViewport(390, 800);
    const dialog = renderAt({
      left: 4,
      top: 80,
      right: 84,
      bottom: 160,
      width: 80,
      height: 80,
    });

    expect(dialog).toHaveAttribute('data-placement', 'below');
    expect(dialog.style.left).toBe('12px');
  });
});
