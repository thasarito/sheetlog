## 2026-05-03 - Missing Interaction Classes on Primary Buttons
**Learning:** The project's icon-only buttons often lack essential `aria-label` attributes and basic interaction feedback classes (`active:scale-95 touch-manipulation focus-visible:ring-2 focus:outline-none`), making them visually inaccessible via keyboard navigation.
**Action:** Add `aria-label` attributes to icon-only buttons, and append interaction classes to ensure keyboard focus states (using primary/destructive ring classes as appropriate) are visually distinguishable.
