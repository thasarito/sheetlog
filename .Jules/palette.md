# 2024-05-22 - Accessibility in Keypad Components

**Learning:** Interactive components like keypads often rely on visual cues (icons) that are invisible to screen readers.
**Action:** Always add `aria-label` to icon-only buttons in custom keypad implementations, even if the "content" seems obvious visually.

# 2024-05-22 - Touch Feedback in PWA

**Learning:** Native-like feel requires immediate touch feedback. Standard CSS `:active` works, but `touch-manipulation` is critical to remove the 300ms tap delay on some mobile browsers.
**Action:** Add `touch-manipulation` to all high-frequency tap targets (like keypads and calculators).
