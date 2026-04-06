## 2025-01-20 - Keypad Accessibility and Touch Feedback
**Learning:** Custom keypads often lack native semantic meaning and can be difficult to use with screen readers or on touch devices without explicit ARIA labels and tactile feedback styles.
**Action:** Always provide explicit `aria-label` attributes for symbol/icon keys (e.g., "." mapped to "Decimal point", "DEL" to "Delete") and include classes like `touch-manipulation` and `active:scale-95` to mimic native button responsiveness on mobile devices, alongside standard focus states (`focus-visible:ring-2`) for keyboard navigation.
