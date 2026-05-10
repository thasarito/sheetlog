## 2024-05-10 - Keypad Accessibility and Interaction

**Learning:** Component buttons that act as custom controls (like a keypad) often miss out on standard button interaction states and explicit ARIA labels. Users rely on standard visual cues like focus rings for keyboard navigation and active states for tactile feedback.

**Action:** Ensure all interactive elements, especially non-standard inputs like keypads, have `focus-visible:ring-2 focus-visible:ring-primary focus:outline-none` for keyboard navigation, `active:scale-95` for touch/click feedback, and explicit `aria-label`s when the visible content is non-descriptive or purely visual (like an icon).
