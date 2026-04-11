
## 2024-04-11 - Add Keypad Accessibility and Mobile Feedback

**Learning:** The custom number Keypad for the transaction flow had interactive keys missing tactile states (active scaling, rounded corners matching the UI style) and critical ARIA labels for non-alphanumeric keys like "DEL" and ".".
**Action:** Always ensure custom keypad buttons include `touch-manipulation`, `active:scale-95`, focus rings, and proper `aria-label` for icons/punctuation to make them both accessible to screen readers and satisfying/responsive on mobile.
