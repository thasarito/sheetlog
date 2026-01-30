import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders correctly with ARIA labels', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    expect(html).toContain('aria-label="Delete"');
  });

  it('renders number keys with aria-labels', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    expect(html).toContain('aria-label="1"');
    expect(html).toContain('aria-label="9"');
    expect(html).toContain('aria-label="0"');
    expect(html).toContain('aria-label="."');
  });

  it('renders with touch-manipulation class', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    expect(html).toContain('touch-manipulation');
  });
});
