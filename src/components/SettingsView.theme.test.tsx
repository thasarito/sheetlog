import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

vi.mock('./SettingsViewContent', () => ({
  SettingsView: () => <section data-testid="settings-view">Settings content</section>,
}));

vi.mock('./ThemeSetting', () => ({
  ThemeSetting: () => <div>Theme controls</div>,
}));

describe('SettingsView theme entry', () => {
  it('opens and closes the centralized theme controls', async () => {
    const user = userEvent.setup();
    render(<SettingsView onToast={vi.fn()} analyticsSync={{} as never} />);

    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    expect(screen.queryByText('Theme controls')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Theme settings' }));
    expect(screen.getByText('Theme controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close theme settings' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Close theme settings' }));
    expect(screen.queryByText('Theme controls')).not.toBeInTheDocument();
  });
});
