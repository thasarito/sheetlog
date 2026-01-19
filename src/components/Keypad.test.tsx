import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders buttons with correct ARIA labels', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(<Keypad value="10" onChange={onChange} />);

    // Basic checks
    expect(html).toContain('aria-label="Delete last digit"');
    expect(html).toContain('aria-label="Decimal separator"');
    expect(html).toContain('aria-label="1"');
    expect(html).toContain('aria-label="0"');
  });

  it('renders all 12 keys', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(<Keypad value="" onChange={onChange} />);

    // Count buttons by counting closing tags
    const buttonCount = (html.match(/<\/button>/g) || []).length;
    expect(buttonCount).toBe(12);
  });
});
