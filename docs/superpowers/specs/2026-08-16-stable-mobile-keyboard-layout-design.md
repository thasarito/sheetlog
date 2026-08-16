# Stable Mobile Keyboard Layout Design

**Date:** 2026-08-16

## Goal

Keep the transaction screen at the same coordinates when a native software keyboard opens or closes. The keyboard may cover the custom keypad and Submit controls temporarily; it must not compress, reflow, or move the transaction UI. A successful touch or pointer selection from the place results must dismiss the native keyboard.

## Scope

This change applies to the SheetLog transaction flow in browser and installed-PWA contexts. It does not redesign the note input, place results, keypad, or Submit button. It does not attempt to keep every covered control visible while the native keyboard is open.

## Layout Behavior

The application will have one stable height owner for the transaction canvas. The current duplicate dynamic-viewport ownership (`body` and `TransactionFlow` both use `dvh`) will be removed from the transaction layout chain.

The stable height will be captured from the root content box, after the body's safe-area padding, and before a focused text input can trigger the native keyboard. Height-only viewport contraction while an editable control is focused will not update the canvas. A genuine width/orientation change may establish a new stable height. Once the keyboard closes, the canvas remains at the same geometry rather than animating through intermediate viewport heights.

Supporting Chromium browsers will also receive the standards-based overlay preferences:

- `interactive-widget=overlays-content` in the viewport meta tag.
- `navigator.virtualKeyboard.overlaysContent = true` behind feature detection.

These controls are progressive enhancement, not the sole correctness mechanism, because WebKit does not consistently support them. The stable canvas remains the cross-browser fallback. No continuous `visualViewport.height`-driven re-layout will be introduced because it is timing-sensitive in Safari and installed PWAs.

## Place Selection and Focus

Pointer or touch selection of an autocomplete result will follow this order:

1. Keep the note input focused while the asynchronous provider resolution is pending.
2. If resolution succeeds, apply the display name and Place ID, retire the autocomplete lifecycle, and blur the note input.
3. If resolution fails, retain focus and the result state so the user can retry.

Nearby-place chip selection will use the same successful-selection blur behavior when the note input is focused. Clear will retain its existing focus-restoration behavior.

Keyboard selection with Arrow keys and Enter will keep logical focus on the note input. This preserves hardware-keyboard accessibility and does not need to dismiss a software keyboard through a pointer interaction.

## Components

- A small stable-height owner will expose the transaction canvas height without coupling place-search state to layout state.
- `index.html` will declare the overlay preference for supporting browsers.
- `TransactionFlow` will consume the stable height as its sole viewport-height source; descendants continue to use `h-full`.
- `TransactionNoteField` will distinguish pointer/touch success from keyboard success and blur only for the former.

## Failure and Compatibility Behavior

- Unsupported `navigator.virtualKeyboard` implementations are ignored without error.
- Provider resolution failures never dismiss the keyboard or discard the user's text.
- The existing stale-selection generation/session guards remain authoritative.
- iOS PWA behavior requires a real-device smoke test because Playwright cannot summon the actual native keyboard and WebKit has known visual-viewport timing differences.

## Test Contract

### Unit and component tests

- Stable height ignores a height-only contraction while the note input is focused.
- Stable height remains inside nonzero top and bottom safe-area insets.
- Stable height accepts a genuine orientation/width change.
- Successful pointer result selection blurs the note input.
- Failed pointer selection leaves the note input focused for retry.
- Arrow/Enter selection keeps logical focus.
- Nearby selection blurs when the note input was focused.
- Clear still restores focus.

### Mobile browser tests

- At 390x844, record the note, keypad, and Submit rectangles.
- Focus the note and simulate a keyboard-sized height contraction without changing width.
- Assert all recorded rectangles retain their x, y, width, and height within one CSS pixel.
- Select an inline result by pointer and assert the note input is no longer focused and the result popup is closed.
- Restore the viewport and assert the original geometry remains unchanged.

### Manual release gate

On installed iOS and Android PWAs, verify that opening the native keyboard does not move the transaction canvas and tapping a place result closes the keyboard after the result resolves.

## Non-goals

- Moving Submit above the native keyboard.
- Replacing the native keyboard with a custom text keyboard.
- Hiding the custom numeric keypad while typing a note.
- Browser-specific user-agent sniffing.
