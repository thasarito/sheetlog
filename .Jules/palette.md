## 2026-02-06 - Accessibility for Custom Keypads
**Learning:** Custom keypad implementations often miss accessibility features present in native buttons or form libraries. Specifically, icon-only buttons (like "Delete") are common in keypads and frequently lack `aria-label`, making them invisible to screen readers.
**Action:** When implementing or auditing custom keypads, always verify `aria-label` for non-numeric keys and ensure touch feedback (active states) is present for a native app feel.
