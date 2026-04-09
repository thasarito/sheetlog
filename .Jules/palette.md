
## 2024-05-17 - Keypad Accessibility & Tactile Feedback
**Learning:** Custom keypads without explicit ARIA labels for non-alphanumeric keys (like "." and "Delete") hinder screen reader users. Furthermore, relying only on hover states for interactive numeric keys provides poor tactile feedback on touch devices and lacks keyboard focus visibility.
**Action:** Always add semantic `aria-label` attributes to icon or symbol keys (`"Delete"` for DEL, `"Decimal point"` for `.`), and consistently apply interaction utilities: `touch-manipulation`, `active:scale-95`, and `focus-visible:ring-2` to ensure proper feedback across mouse, touch, and keyboard navigation.
