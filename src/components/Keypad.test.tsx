import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Keypad } from './Keypad';

test('Keypad delete button has aria-label', () => {
  const handleChange = vi.fn();
  const html = renderToStaticMarkup(<Keypad value="" onChange={handleChange} />);

  // Check for the aria-label on the delete button
  // Note: This test expects the aria-label to be present, which it isn't yet.
  expect(html).toContain('aria-label="Delete"');
});

test('Keypad renders all keys', () => {
  const handleChange = vi.fn();
  const html = renderToStaticMarkup(<Keypad value="" onChange={handleChange} />);

  // Check for numbers 0-9 and .
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.'].forEach((key) => {
    // We look for >key< to match the button content
    expect(html).toContain(`>${key}<`);
  });
});
