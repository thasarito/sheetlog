## 2026-03-30 - Accessible Numeric Input & Action Buttons
**Learning:** Numeric input keypads (like `Keypad.tsx`) and related action buttons in this app benefit greatly from consistent tactile feedback classes (`active:scale-95`), mobile optimization (`touch-manipulation`), and accessible names for non-text keys (`DEL` and `.`).
**Action:** When working on custom interactive elements, always ensure ARIA labels exist for icon/symbol-only elements, and enforce standard keyboard focus rings (`focus-visible:ring-2 focus-visible:ring-primary focus:outline-none`).
