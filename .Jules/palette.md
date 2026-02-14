## 2025-01-28 - Keypad Accessibility
**Learning:** Custom keypad components (like `Keypad.tsx`) often lack native semantic value and require manual `aria-label` assignment for screen readers to understand keys like "DEL" or ".".
**Action:** Always verify custom input components with screen reader simulation (or ARIA checks) as they don't inherit native button accessibility by default.
