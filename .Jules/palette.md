## 2026-02-24 - Accessibility for Custom Keypads
**Learning:** Custom numeric keypads often fail accessibility by lacking labels for non-numeric keys and proper keyboard focus states.
**Action:** When implementing custom inputs like keypads:
1. Ensure all icon-only or ambiguous buttons (like "DEL" or ".") have explicit `aria-label`s.
2. Add `focus-visible` styles (`ring-2`, `ring-primary`) for keyboard navigation.
3. Use `active:scale-95` for tactile feedback to mimic native button feel.
