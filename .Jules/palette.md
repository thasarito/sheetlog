## 2024-05-18 - Keypad Tactile Feedback and Accessibility
**Learning:** Large interactive elements like keypads greatly benefit from standard interaction patterns (`rounded-2xl`, `touch-manipulation`, `active:scale-95`, `focus-visible:ring-2`) and require `aria-label` for non-obvious keys (like "DEL" or ".") to ensure both mobile responsiveness and screen reader accessibility.
**Action:** Apply these standard tactile and focus classes, along with proper `aria-label` definitions, to similar custom control grids across the app.
