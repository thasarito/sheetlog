## 2024-04-21 - Keypad Accessibility and Interaction Standardization
**Learning:** Icon-only keys like 'Delete' on numeric keypads often lack accessible labels, and missing standard touch/focus classes on heavily used numeric interfaces degrades mobile and keyboard usability.
**Action:** Applied standard ARIA labels to specialized keypad buttons ('Delete', 'Decimal point') and implemented standard interaction utility classes (`touch-manipulation`, `active:scale-95`, `focus-visible:ring-2`) to ensure consistency with the rest of the application.
