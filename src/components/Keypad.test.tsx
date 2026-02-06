import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders correctly with accessibility attributes', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(<Keypad value="" onChange={onChange} />);

    // Check for aria-label on Delete button
    expect(html).toContain('aria-label="Delete"');

    // Check for interaction classes
    expect(html).toContain('active:scale-95');
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('touch-manipulation');
    expect(html).toContain('select-none');
  });
});
