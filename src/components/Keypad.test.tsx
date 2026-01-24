import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders DEL button with aria-label', () => {
    const html = renderToStaticMarkup(<Keypad value="123" onChange={vi.fn()} />);
    expect(html).toContain('aria-label="Delete last digit"');
  });

  it('renders digit buttons without aria-label (or correct label)', () => {
    const html = renderToStaticMarkup(<Keypad value="123" onChange={vi.fn()} />);
    // digit "1" should be present
    expect(html).toContain('>1<');
  });
});
