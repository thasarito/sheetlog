## 2024-05-22 - Accessibility Patterns in Transaction Flow

**Learning:** The application heavily relies on icon-only buttons (Keypad delete, StepAmount delete) without accessible names. This is a recurring pattern in the custom UI components.
**Action:** Systematically check all `lucide-react` icon usages within `<button>` elements for missing `aria-label` attributes during future enhancements.

**Learning:** Interactive components like `Keypad` were missing focus states, making keyboard navigation impossible.
**Action:** Always verify `focus-visible` styles on custom interactive elements, especially those mimicking native inputs.
