## 2024-05-24 - Keypad Accessibility
**Learning:** Custom keypad components often miss standard button affordances found in native inputs. The 'Delete' and '.' keys were completely invisible to screen readers without ARIA labels, and the touch target feedback was nonexistent.
**Action:** When building custom input methods, always explicitly map non-text keys to ARIA labels and add 'touch-manipulation' CSS to prevent browser zoom delays.
