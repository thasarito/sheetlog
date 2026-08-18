# Transparent Carousel with Track-Bound Titles

## Goal

Make the home review carousel feel like one continuous canvas behind the category sheet. Remove the duplicated slide headers and dot controls, replace them with large titles that travel horizontally with their slides, and keep transaction refresh available in the transaction content.

## Scope

- Make the full Transactions and Analytics slide canvases transparent.
- Remove the existing compact Transactions and Analytics headers.
- Remove the shared carousel dot controls.
- Make Analytics slide 1 and the initially visible/default review; make Transactions slide 2.
- Add one large, centered visible title to each slide: `Transactions` and `Analytics`.
- Make each title part of its slide so it follows the carousel's drag and snap motion.
- Move the transaction Refresh action beside the transaction count/status below Search.
- Preserve the existing category sheet, transaction selection/edit flow, analytics interactions, swipe gestures, keyboard navigation, live announcements, and reduced-motion behavior.

## Non-goals

- Do not change the category sheet's surface, snap points, or transaction-entry flow.
- Do not restyle individual inputs, controls, rows, charts, or cards.
- Do not add a new animation library or a new component configuration API.
- Do not add persistent title tabs or another direct tap target for changing slides. The selected track-bound treatment intentionally uses swipe and keyboard navigation.

## Component Design

### Carousel

`HomeDashboardCarousel` keeps the existing horizontal snap viewport, pointer gesture handling, scroll settling, inactive-slide isolation, keyboard ArrowLeft/ArrowRight navigation, and live slide announcement. The track order becomes Analytics first and Transactions second, with active index zero continuing to define the default slide.

The shared `CarouselIndicators` overlay is removed. Each slide remains a full-width child of the same horizontal track, so its title and detail content translate together during a drag or smooth snap.

### Transactions slide

`TransactionHistoryView` replaces its compact bordered header and reserved indicator spacer with one 80-pixel-high (`h-20`) title region. The visible `Transactions` heading is centered, uses 28-pixel bold display text with tight tracking, and remains the semantic `h2` for the slide.

The slide root and its main content canvas use a transparent background. The Search input and existing row/control surfaces keep their current styling.

The Refresh button moves to the right edge of the metadata row below Search. The transaction count stays left-aligned; the saved/downloading status and Refresh button form the right-aligned group. Refresh retains its accessible label, disabled state, spinner, focus ring, and refresh behavior. Its touch target remains 44 by 44 CSS pixels.

### Analytics slide

`AnalyticsView` replaces its compact bordered header and reserved indicator spacer with the same 80-pixel-high title region and 28-pixel bold display typography. The visible `Analytics` heading remains the semantic `h2` for the slide.

The slide root becomes transparent. Analytics controls, charts, filters, loading/error states, and transaction rows retain their existing surfaces and behavior.

## Motion

The large titles do not animate independently. They live inside their respective slides, so the existing physical carousel motion drives the animation: the outgoing title moves out with its slide while the incoming title moves in with the next slide.

Programmatic and keyboard slide changes continue to use the carousel's existing smooth-scroll behavior, with immediate scrolling when `prefers-reduced-motion: reduce` is active. No additional transform, opacity, timer, or motion state is introduced.

## Accessibility

- Keep the carousel label, roledescription, live current-slide announcement, and viewport keyboard target.
- Keep exactly one visible `h2` in each slide; the inactive slide remains `aria-hidden` and inert through the existing synchronization.
- Label Analytics as slide 1 of 2 and Transactions as slide 2 of 2 everywhere the carousel exposes its order.
- Remove dot-control buttons and their fieldset because the chosen treatment intentionally has no persistent direct-selection control.
- Keep the transaction Refresh action keyboard reachable and clearly labeled in its new location.
- Do not create focusable elements solely for animation.

## Data and Error Handling

No query, mutation, analytics, or transaction data flow changes. Refresh continues to call the same history and base-amount refetch operations. Existing loading, offline, and error states are unchanged.

## Testing

Use a red-green cycle for focused regressions, then update affected existing expectations:

- Assert that the carousel no longer renders slide-selection dot buttons.
- Assert that Analytics is slide 1 and active by default, ArrowRight/swipe-left activates Transactions, and ArrowLeft/swipe-right returns to Analytics.
- Update transaction-specific browser scenarios to activate Transactions explicitly instead of relying on the former default slide, including reimbursement source/Undo flows and complete-history search.
- Assert that Transactions and Analytics retain their visible semantic headings inside their slides.
- Assert that both slide canvases are transparent while internal controls retain their existing surface classes.
- Assert that Refresh remains present and invokes the existing refresh operations from its new metadata-row location.
- Exercise swipe and keyboard navigation to confirm title/slide state and inactive-slide accessibility remain synchronized.
- In the browser suite, verify computed transparent backgrounds and confirm the title's horizontal position follows its slide during navigation.
- Run lint, TypeScript, focused tests, the complete unit suite, build, and relevant Playwright coverage before pushing.

## Delivery

Base the implementation on the latest `origin/main`. After verification, commit the implementation and push the resulting commit directly to `origin/main`, as explicitly requested. Re-fetch immediately before pushing and rebase if the remote base moved.
