## 2024-03-24 - Missing ARIA label for icon-only Delete button in StepAmount
**Learning:** Icon-only buttons used for destructive actions (like deleting a transaction) must have ARIA labels to ensure screen reader users can understand their purpose. Specifically, the Delete button in `StepAmount` used a `Trash2` icon but lacked an `aria-label`.
**Action:** When adding icon-only buttons, especially those using icons like `Trash2`, `Settings`, or `ChevronLeft`, always remember to add an `aria-label` attribute.
