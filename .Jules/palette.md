## 2024-05-15 - Keypad Accessibility and Touch Feedback
**Learning:** Custom numeric keypads often miss basic button interactions since they aren't standard form inputs. Screen readers read "." as a pause and "DEL" confusingly without proper labels.
**Action:** Always add explicit `aria-label`s for non-alphanumeric keys on custom keypads (e.g. `aria-label="Delete"` and `aria-label="Decimal point"`) and apply standard interaction classes (`rounded-2xl`, `touch-manipulation`, `active:scale-95`, `focus-visible:ring-2`) to ensure mobile tap targets feel responsive and are keyboard navigable.
