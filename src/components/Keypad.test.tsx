import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Keypad } from './Keypad';

describe('Keypad', () => {
  it('renders aria-label for Delete button', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    // Look for the button that contains the Delete icon or has the key DEL
    // Currently, the code maps over keys. The DEL key renders a button.
    // We want to ensure that button has aria-label="Delete".
    expect(html).toContain('aria-label="Delete"');
  });

  it('renders aria-label for Decimal point button', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    expect(html).toContain('aria-label="Decimal point"');
  });

  it('renders aria-label for number buttons', () => {
    const html = renderToStaticMarkup(<Keypad value="" onChange={() => {}} />);
    // Just check one number
    expect(html).toContain('aria-label="1"');
  });
});
