import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SettingsControlSection } from './SettingsControlSection';

function Harness() {
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggle = (id: string) => {
    setExpanded((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  return (
    <>
      <SettingsControlSection
        id="accounts"
        eyebrow="Organize"
        title="Accounts"
        summary="1 account"
        icon={<span aria-hidden="true">A</span>}
        expanded={expanded.includes('accounts')}
        onToggle={() => toggle('accounts')}
      >
        <p>Wallet</p>
      </SettingsControlSection>
      <SettingsControlSection
        id="categories"
        eyebrow="Organize"
        title="Categories"
        summary="3 categories"
        icon={<span aria-hidden="true">C</span>}
        expanded={expanded.includes('categories')}
        onToggle={() => toggle('categories')}
      >
        <p>Food</p>
      </SettingsControlSection>
    </>
  );
}

describe('SettingsControlSection', () => {
  it('keeps controlled sections independently expanded with accessible regions', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const accounts = screen.getByRole('button', { name: /Accounts/ });
    const categories = screen.getByRole('button', { name: /Categories/ });
    expect(accounts).toHaveAttribute('aria-expanded', 'false');
    expect(categories).toHaveAttribute('aria-expanded', 'false');
    expect(accounts.querySelector('[data-settings-icon-badge]')).toBeInTheDocument();
    expect(categories.querySelector('[data-settings-icon-badge]')).toBeInTheDocument();

    await user.click(accounts);
    await user.click(categories);

    expect(accounts).toHaveAttribute('aria-expanded', 'true');
    expect(categories).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Accounts' })).toHaveTextContent('Wallet');
    expect(screen.getByRole('region', { name: 'Categories' })).toHaveTextContent('Food');

    await user.click(accounts);
    expect(screen.queryByRole('region', { name: 'Accounts' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Categories' })).toBeVisible();
  });
});
