## 2024-05-15 - Keypad accessibility and interaction
**Learning:** When implementing custom keypads with icon-only buttons (like delete or decimal point), explicit `aria-label`s are necessary for screen reader accessibility, and missing tactile feedback (`active:scale-95`) can make interactions feel sluggish.
**Action:** Always ensure custom keypads map special characters (e.g. `DEL` or `.`) to full descriptive words (`Delete`, `Decimal point`), and use `active:scale-95` to provide visual feedback for keypresses.
