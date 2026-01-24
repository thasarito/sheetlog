## 2024-05-22 - Accessibility Gaps in Icon-Only Buttons
**Learning:** Many interactive elements (Keypad, Action Buttons) rely solely on icons without accessible names (`aria-label`). This makes the app difficult to use for screen reader users.
**Action:** Systematically audit icon-only buttons and add `aria-label`. Use `renderToStaticMarkup` tests to prevent regression without heavy testing dependencies.
