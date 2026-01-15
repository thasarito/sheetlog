import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad Accessibility', () => {
  it('renders DEL button with descriptive aria-label', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    // Should fail initially
    expect(html).toContain('aria-label="Delete last digit"');
  });

  it('renders decimal point button with descriptive aria-label', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    // Should fail initially
    expect(html).toContain('aria-label="Decimal point"');
  });

  it('renders buttons with accessible focus styles', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    // Check for focus-visible styles
    expect(html).toContain('focus-visible:ring-2');
  });
});
