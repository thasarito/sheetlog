# Silent Reimbursement Action Design

## Context

The first reimbursement UI exposed confirmed, queued, and remaining totals above a text
`Reimburse` button. That information is useful for ledger diagnostics, but it makes the edit footer
visually heavy for the app's single-user, rapid-entry workflow. Google Maps attribution also appears
under nearby-place chips and at the bottom of the place-search drawer.

This follow-up keeps all reimbursement accounting and validation behavior intact while making the
entry point visually silent. It also removes the visible Google Maps attribution at the product
owner's direction. The documented production gate for durable Google place-name storage remains;
removing attribution does not waive or change provider requirements.

## Reimbursement footer

Replace the balance block and text button with one square icon button in the existing footer's
middle position, between Delete and Save. Use the Lucide `HandCoins` icon for the normal action. The
button must match the Delete control's visual weight and touch target and must not use a shadow.

Do not render confirmed, queued, remaining, offline-verification, fully-reimbursed, mismatch, or
over-reimbursed text. The ledger continues calculating and enforcing every one of those states; only
their visible presentation changes.

The control maps states as follows:

| State | Icon | Interaction | Accessible name |
| --- | --- | --- | --- |
| Reimbursement available | `HandCoins` | Enabled; opens the reimbursement form | `Reimburse` |
| Checking balance | Animated `Loader2` | Disabled | `Checking reimbursements` |
| Check failed | `RotateCcw` | Enabled; retries the balance query | `Retry reimbursement check` |
| Source deletion in progress | `HandCoins` | Disabled | `Reimbursement unavailable` |
| Fully reimbursed | `HandCoins` | Disabled | `Fully reimbursed` |
| Currency mismatch, over-reimbursed, or unknown balance | `HandCoins` | Disabled | `Reimbursement unavailable` |
| Offline with a usable best-known balance | `HandCoins` | Enabled; opens the reimbursement form | `Reimburse` |

The icon is decorative inside the named button. A screen-reader user receives the current state from
the button's accessible name; no visible tooltip, badge, counter, or helper text is added. Disabled
states remain visually distinguishable through the existing disabled styling.

## Places attribution

Remove the visible `Google Maps` attribution from both the nearby-place chip rail and the dedicated
place-search drawer. Delete the shared attribution component once it has no consumers. Nearby chips,
the final Search chip, autocomplete results, and note replacement behavior do not otherwise change.

## Data and behavior boundaries

This change does not modify reimbursement summaries, sync validation, queued/error reservations,
Sheet schema, transaction records, offline behavior, or exact-child undo. It does not change which
transactions can be reimbursed. It only changes presentation and the retry control's visual form.

## Verification and PR artifacts

Update focused component tests first to assert the icon-only state matrix, retry behavior, accessible
names, and absence of visible balance labels or attribution. Keep flow and mobile E2E coverage for
footer order and reimbursement entry. Refresh the Places and reimbursement screenshots already
embedded in the draft pull request so they show the final UI.
