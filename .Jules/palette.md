## 2024-10-24 - Keypad accessibility and tactile feedback
**Learning:** Standard interactive elements like Keypads need explicit standard tactile interactions (`touch-manipulation`, `active:scale-95`), focus styles (`focus-visible:ring-2 focus-visible:ring-primary focus:outline-none`), border radius (`rounded-2xl`), and explicit ARIA labels for non-alphanumeric keys like "Delete" and "Decimal point".
**Action:** Ensure all custom UI component buttons have these classes for tactile response and keyboard accessibility. Use explicit `aria-label` when mapping keys.
