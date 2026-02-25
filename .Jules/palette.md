## 2026-02-25 - Accessibility gaps in interactive components
**Learning:** Common interactive components like `Keypad` rely on visual cues (icons, text) that are insufficient for screen readers (e.g., "DEL" icon without label, "." read as punctuation). This creates a barrier for users relying on assistive technology.
**Action:** When auditing components, specifically check for icon-only buttons or ambiguous text labels and mandate `aria-label` attributes. Also, ensure touch targets have proper feedback (`active` states) and keyboard focus styles (`focus-visible`).
