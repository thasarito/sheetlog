## 2024-05-15 - Keypad Accessibility
**Learning:** The `Keypad` component is a core interaction surface for numeric entry, but its custom buttons (particularly Delete and Decimal point) lack `aria-label`s, making them opaque to screen readers. Additionally, numeric keys lack focus visible styles for keyboard users.
**Action:** Always add explicit `aria-label`s to icon-only interactive elements and ensure all interactive elements use `focus-visible:ring-2` to support keyboard navigation.
