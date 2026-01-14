## 2025-05-23 - Keypad Accessibility and Feedback
**Learning:** Icon-only buttons (like delete keys) often lack `aria-label`s, making them invisible to screen readers. For high-frequency interaction components like keypads, adding tactile feedback (active states) and visible focus rings significantly improves the perceived quality ("micro-UX").
**Action:** Always check `aria-label` for icon buttons and add `active:scale-95` or similar transforms to interactive buttons for better touch feedback.
