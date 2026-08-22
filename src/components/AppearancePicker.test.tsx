import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./ui/drawer', () => ({
  Drawer: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('./AdvancedColorPicker', () => ({
  AdvancedColorPicker: ({ open }: { open: boolean }) =>
    open ? <div>Advanced color picker</div> : null,
}));

import { AppearancePicker } from './AppearancePicker';

type PickerSection = 'appearance' | 'icon' | 'color';

function renderPicker(section: PickerSection) {
  const props: React.ComponentProps<typeof AppearancePicker> = {
    open: true,
    onOpenChange: vi.fn(),
    initialIcon: 'Wallet',
    initialColor: '#123456',
    onSave: vi.fn(),
    section,
  };

  render(<AppearancePicker {...props} />);
  return props;
}

describe('AppearancePicker sections', () => {
  it('shows only the existing icon picker when opened from an icon button', async () => {
    const user = userEvent.setup();
    const props = renderPicker('icon');

    expect(screen.getByRole('button', { name: 'Use Coffee icon' })).toBeInTheDocument();
    expect(screen.queryByText('Color')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose custom color' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use Coffee icon' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledWith('Coffee', '#123456');
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows only the existing palette and custom-color picker from a color button', async () => {
    const user = userEvent.setup();
    const props = renderPicker('color');

    expect(screen.queryByRole('button', { name: 'Use Coffee icon' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose custom color' })).toBeInTheDocument();

    const [firstColor] = screen.getAllByRole('button', { name: /^Use .+ color$/ });
    await user.click(firstColor);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledWith(
      'Wallet',
      expect.stringMatching(/^#[0-9a-f]{6}$/i),
    );
  });

  it('keeps the existing advanced custom-color picker available', async () => {
    const user = userEvent.setup();
    renderPicker('color');

    await user.click(screen.getByRole('button', { name: 'Choose custom color' }));

    expect(screen.getByText('Advanced color picker')).toBeInTheDocument();
  });
});
