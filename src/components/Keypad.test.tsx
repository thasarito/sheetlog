import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders correctly with accessibility attributes', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);

    // Check for aria-label on delete button
    expect(html).toContain('aria-label="Backspace"');

    // Check for rounded-2xl on buttons
    expect(html).toContain('rounded-2xl');

    // Check for focus styles
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-visible:ring-primary');

    // Check for active scale
    expect(html).toContain('active:scale-90');

    // Check for touch manipulation
    expect(html).toContain('touch-manipulation');

    // Check for hover state
    expect(html).toContain('hover:bg-muted');
  });
});
