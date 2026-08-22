import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuickNoteIcon } from './QuickNoteIcon';

describe('QuickNoteIcon', () => {
  it('renders a matched brand for a legacy placeholder icon', () => {
    const { container } = render(
      <QuickNoteIcon icon="StickyNote" label="grab" className="h-4 w-4" />,
    );

    expect(container.querySelector('[data-quick-note-brand="grab"]')).toBeInTheDocument();
  });

  it('preserves a valid explicitly selected Lucide icon', () => {
    const { container } = render(
      <QuickNoteIcon icon="Coffee" label="7-11" className="h-4 w-4" />,
    );

    expect(container.querySelector('[data-quick-note-brand]')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders an explicitly persisted brand without label inference', () => {
    const { container } = render(
      <QuickNoteIcon icon="brand:spotify" label="music" className="h-4 w-4" />,
    );

    expect(container.querySelector('[data-quick-note-brand="spotify"]')).toBeInTheDocument();
  });
});
