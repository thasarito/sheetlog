import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdvancedColorPicker } from './AdvancedColorPicker';

function renderPicker() {
  const props: React.ComponentProps<typeof AdvancedColorPicker> = {
    open: true,
    onOpenChange: vi.fn(),
    color: '#123456',
    onSelect: vi.fn(),
  };

  render(<AdvancedColorPicker {...props} />);
  return props;
}

describe('AdvancedColorPicker', () => {
  it('renders as a nested modal above the appearance dialog', async () => {
    renderPicker();

    const dialog = await screen.findByRole('dialog', {
      name: 'Custom Color',
    });
    expect(dialog).toHaveAttribute(
      'data-advanced-color-presentation',
      'dialog',
    );
    expect(dialog).toHaveClass('relative', 'z-[90]');
  });
});
