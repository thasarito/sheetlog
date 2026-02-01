import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders buttons with correct accessible labels', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);

    // Check for "Delete" aria-label (for the DEL key)
    expect(html).toContain('aria-label="Delete"');

    // Check for "1" aria-label (or at least the text content "1")
    expect(html).toContain('aria-label="1"');
    expect(html).toContain('aria-label="."');
  });

  it('applies accessible classes', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);

    // Check for focus-visible styles
    expect(html).toContain('focus-visible:ring-2');

    // Check for active state feedback
    expect(html).toContain('active:scale-95');

    // Check for rounded corners
    expect(html).toContain('rounded-2xl');
  });
});
