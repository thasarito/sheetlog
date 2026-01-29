import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders "Delete" button with aria-label', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);

    // Check for the presence of the delete button (by icon class or structure if needed,
    // but looking for the aria-label on the button is the goal).
    // The current code does NOT have aria-label="Delete".
    // We expect this to fail initially if we assert strictly for the label.

    // Check if any button has aria-label="Delete"
    const hasAriaLabel = html.includes('aria-label="Delete"');

    expect(hasAriaLabel).toBe(true);
  });

  it('renders numeric keys', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    expect(html).toContain('>1<');
    expect(html).toContain('>9<');
  });
});
