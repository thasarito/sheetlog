import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CategoryItem,
  QuickNotesConfig,
  TransactionType,
} from '../../lib/types';
import { StepCategory } from './StepCategory';
import { useTransactionForm } from './useTransactionForm';

const quickNotesMock = vi.hoisted(() => ({
  config: {} as QuickNotesConfig,
}));

vi.mock('../../hooks/useQuickNotes', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useQuickNotes')>(
    '../../hooks/useQuickNotes',
  );
  return {
    ...actual,
    useQuickNotesQuery: () => ({ data: quickNotesMock.config }),
  };
});

vi.mock('../DateTimeDrawer', () => ({ DateTimeDrawer: () => null }));

const categoryGroups: Record<TransactionType, CategoryItem[]> = {
  expense: [{ name: 'Food', icon: 'Utensils', color: '#f97316' }],
  income: [],
  transfer: [],
};

function Harness() {
  const form = useTransactionForm({
    initialValues: { type: 'expense', category: '', note: '' },
  });
  const values = form.useStore((state) => state.values);

  return (
    <>
      <output data-testid="form-category">{values.category || 'empty'}</output>
      <output data-testid="form-note">{values.note || 'empty'}</output>
      <StepCategory
        form={form}
        categoryGroups={categoryGroups}
        onConfirm={vi.fn()}
      />
    </>
  );
}

function categoryRect(): DOMRect {
  return {
    x: 40,
    y: 320,
    left: 40,
    top: 320,
    right: 120,
    bottom: 400,
    width: 80,
    height: 80,
    toJSON: () => ({}),
  } as DOMRect;
}

function prepareTile() {
  const tile = screen.getByRole('button', { name: 'Food' });
  let captured = false;
  Object.defineProperties(tile, {
    getBoundingClientRect: {
      configurable: true,
      value: () => categoryRect(),
    },
    hasPointerCapture: {
      configurable: true,
      value: () => captured,
    },
    setPointerCapture: {
      configurable: true,
      value: () => {
        captured = true;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value: () => {
        captured = false;
      },
    },
  });
  return tile;
}

async function beginFoodLongPress(tile: HTMLElement) {
  fireEvent.pointerDown(tile, {
    pointerId: 71,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 360,
  });
  await act(async () => vi.advanceTimersByTimeAsync(400));
}

beforeEach(() => {
  vi.useFakeTimers();
  quickNotesMock.config = {
    'expense:Food': [
      { id: 'custom-1', icon: 'Salad', label: 'Custom one', note: 'custom one' },
      { id: 'custom-2', icon: 'Coffee', label: 'Custom two', note: 'custom two' },
      { id: 'custom-3', icon: 'Soup', label: 'Custom three', note: 'custom three' },
      { id: 'custom-4', icon: 'Sandwich', label: 'Custom four', note: 'custom four' },
      { id: 'custom-5', icon: 'Cake', label: 'Custom five', note: 'custom five' },
    ],
    'default:expense': [
      { id: 'default-1', icon: 'House', label: 'Default one', note: 'default one' },
      { id: 'default-2', icon: 'Briefcase', label: 'Default two', note: 'default two' },
      { id: 'default-3', icon: 'User', label: 'Default three', note: 'default three' },
      { id: 'default-4', icon: 'Users', label: 'Default four', note: 'default four' },
      { id: 'default-5', icon: 'Star', label: 'Default five', note: 'default five' },
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StepCategory One UI context menu', () => {
  it('keeps a stationary release open with four ordered custom notes and four type defaults', async () => {
    render(<Harness />);
    const tile = prepareTile();

    await beginFoodLongPress(tile);
    fireEvent.pointerUp(tile, {
      pointerId: 71,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 360,
    });

    const dialog = screen.getByRole('dialog', { name: 'Food quick notes' });
    expect(tile).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('form-category')).toHaveTextContent('empty');
    expect(
      within(dialog).getByRole('button', { name: 'Use Food category' }),
    ).toBeInTheDocument();

    for (const label of ['Custom one', 'Custom two', 'Custom three', 'Custom four']) {
      expect(within(dialog).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(
      within(dialog).queryByRole('button', { name: 'Custom five' }),
    ).not.toBeInTheDocument();

    for (const label of ['Default one', 'Default two', 'Default three', 'Default four']) {
      expect(within(dialog).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(
      within(dialog).queryByRole('button', { name: 'Default five' }),
    ).not.toBeInTheDocument();
  });

  it('uses the category only after the gesture leaves and returns to its tile', async () => {
    render(<Harness />);
    const tile = prepareTile();

    await beginFoodLongPress(tile);
    fireEvent.pointerMove(tile, {
      pointerId: 71,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 240,
    });
    fireEvent.pointerMove(tile, {
      pointerId: 71,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 360,
    });
    fireEvent.pointerUp(tile, {
      pointerId: 71,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 360,
    });

    expect(screen.getByTestId('form-category')).toHaveTextContent('Food');
    expect(screen.getByTestId('form-note')).toHaveTextContent('empty');
    expect(
      screen.queryByRole('dialog', { name: 'Food quick notes' }),
    ).not.toBeInTheDocument();
  });
});
