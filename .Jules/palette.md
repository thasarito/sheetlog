## 2026-01-23 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Icon-only buttons (like Trash or Backspace) are frequently implemented without `aria-label` attributes, making them inaccessible to screen reader users who only hear "button" or nothing.
**Action:** Always check icon-only buttons for `aria-label`. Use a lightweight test with `renderToStaticMarkup` to verify presence of accessible names in critical components.
