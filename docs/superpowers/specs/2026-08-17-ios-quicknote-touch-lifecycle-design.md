# iOS Quick-Note Touch Lifecycle

## PR Boundary

This is PR 1 of 2. It targets `main` and contains only the quick-note correctness fix and its regressions.

It does not add a haptic adapter, radial snap feedback, or carousel snap feedback. The existing long-press activation pulse remains unchanged. Those changes belong exclusively to PR 2.

## Goal

Keep the quick-note radial menu active while an iPhone Home Screen PWA user drags beyond a category tile, then apply the selected quick note when the finger is released.

The fix must preserve ordinary category taps, the 400 ms long press, horizontal Expense/Income/Transfer swipes, vertical category scrolling, and suppression of the synthetic click after a completed long press.

## Failure Being Corrected

The current implementation lets the browser emit touch-derived pointer cancellation after long-press activation. `CategoryGrid` routes `pointercancel` and `pointerleave` through radial `onCancel`, so iOS can unmount the ring even though the touch itself is still active. A short Chromium drag does not expose the failure because pointer capture remains intact and the test stays inside the tile.

## Gesture States

`CategoryGrid` owns category-tile gesture recognition through four states:

1. **Pending:** a single-finger native `touchstart`, or a mouse/stylus pointer down, starts the existing 400 ms timer.
2. **Active touch quick note:** the timer fires while the initiating touch is still stationary, and native touch events own the remainder of that sequence.
3. **Active pointer quick note:** the timer fires for mouse or stylus, and pointer events with pointer capture own the remainder of that sequence.
4. **Finished or cancelled:** timers and gesture references are cleared. Any gesture that reached activation suppresses a subsequent synthetic click, including one later ended by cancellation.

Movement beyond the existing 10 px tolerance while pending cancels long-press eligibility and leaves native scrolling available.

## Native Touch Ownership

Touch uses native events from the initial press rather than splitting ownership between Touch Events and React Pointer Events:

- A single-touch `touchstart` on the tile records the initiating `Touch.identifier` and start coordinates, then installs temporary document-level move, end, cancel, and additional-start listeners for that owned sequence.
- A second touch cancels the pending or active quick-note gesture; multitouch is not a category gesture.
- `touchmove` finds the initiating identifier in `touches`.
  - Before activation, it applies the movement tolerance without preventing default.
  - After activation, it calls `preventDefault()` and updates the radial drag position.
- `touchend` finds the initiating identifier in `changedTouches`. If the long press is active, those final coordinates are passed to radial release.
- Any `touchcancel` containing the initiating identifier closes an active radial menu without selecting.
- Touch never requests pointer capture.
- React pointer down, move, up, leave, and cancel handlers ignore `pointerType === "touch"`, preventing touch-derived pointer events from duplicating or cancelling the native lifecycle.

Temporary document-level listeners ensure the ring follows the initiating touch outside the tile and can observe a second touch that begins elsewhere. The `touchmove` listener is non-passive only so it can prevent scrolling after activation; it never prevents default while the gesture is pending. All temporary listeners are removed when the owned sequence finishes, cancels, or the tile unmounts.

Native listeners use stable callback references so they always call the latest radial handlers without being reinstalled on every render.

## Mouse and Stylus Ownership

Mouse and stylus retain the existing pointer path:

- Pointer down records the start and begins the timer.
- Pointer move cancels a pending long press beyond the tolerance or updates an active radial drag.
- Pointer capture begins only after activation.
- Pointer up releases the radial selection and suppresses the subsequent click.
- Pointer cancel closes an active radial menu.
- Pointer leave may cancel a pending, non-captured press, but it does not close an already active captured gesture.

## Failure Handling and Cleanup

- Matching `touchcancel` and non-touch `pointercancel` close the radial menu and release the quick-note lock.
- Unmounting removes tile and temporary document-level touch listeners, clears the long-press timer, and clears touch/pointer identity and position references.
- A release without the initiating touch identifier cannot select a quick note and cleans up safely.
- Gesture cleanup does not mutate transaction type, category, or carousel position.
- Once activation occurs, release or cancellation leaves synthetic-click suppression armed for the next click from that sequence.

## Automated Verification

Unit coverage will verify:

- The initiating `Touch.identifier` is retained through movement and release.
- An active touch quick note is unaffected by touch-derived `pointerleave` and incidental `pointercancel`.
- A native drag beyond the tile prevents scrolling, updates the ring, and releases using matching `touchend.changedTouches` coordinates.
- Matching `touchcancel` closes the menu.
- Multitouch cancels safely.
- Release and cancellation after activation both suppress the synthetic category click.
- Mouse and stylus still use pointer capture and pointer cancellation.
- Pre-activation movement still cancels long press without preventing carousel or vertical scrolling.
- Ordinary taps and completed-long-press click suppression remain unchanged.

The mobile Chromium regression will seed a distinctive quick note, hold beyond 400 ms, drag outside the tile to that rendered radial target, verify that the ring remains visible and the carousel remains stationary, release, and verify the seeded note or amount was applied.

Existing category tap, carousel swipe, vertical scrolling, live-tab animation, and accessibility regressions must remain green.

## Real-iPhone Verification

Mobile Chromium cannot prove iOS WebKit event ordering or installed-PWA behavior. Before declaring the iPhone bug fixed, manually test the deployed PR build in an installed iPhone PWA:

1. Hold a category until its quick-note ring appears.
2. Drag outside the tile to a known quick-note target and confirm the ring stays visible.
3. Release and confirm that exact quick note is applied.
4. Confirm a normal horizontal category swipe still changes transaction type.
5. Record the iOS version and result in the PR.
