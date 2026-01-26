import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders DEL button with aria-label', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    // It should have aria-label="Delete last digit"
    expect(html).toContain('aria-label="Delete last digit"');
    // It should have the SVG
    expect(html).toContain('<svg');
  });
});
