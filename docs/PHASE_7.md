# Phase 7 — Polish

## Scope and setup

This is a focused polish pass over the existing app. No database migrations,
credentials or new packages are required. Reload the Metro-connected development
app. The Phase 6 native rebuild is still required if it was never performed.

## Changes

- **Keyboard handling:** shared scroll screens adjust iOS keyboard insets and
  support dragging to dismiss the keyboard. Numeric iOS inputs have individually
  linked Done controls (including weight, measurement and workout-set fields).
  Android retains its existing resize behavior and gains drag dismissal.
- **Feedback:** profile loading and request failures are no longer represented
  as an empty profile. Retry messages explain schema/setup errors. Shared errors
  expose an alert separately from their retry button, so the action remains
  independently reachable. Loading messages wrap instead of overflowing.
- **Controls and large text:** buttons wrap centered labels, selection controls
  expose radio/checked states, and a visible checkmark supplements selection
  color. Option rows have at least 56-point height. Numeric Done buttons and
  existing action buttons also retain 56-point targets.
- **Reduced motion:** press feedback avoids animation timers when Reduce Motion
  is enabled; active animations are stopped on preference change/unmount.
  Existing entrance animations and navigation's reduced-motion behavior remain.
- **Photo performance:** the timeline renders one 12-photo page at a time with
  Older/Newer navigation, instead of accumulating every previously loaded image.
  At most two additional comparison images are mounted. Selection can span pages;
  changing category clears the comparison. Cursor history stores metadata only.
  Photo queries and signed-link polling pause when the Progress tab is hidden;
  the existing app focus manager handles app backgrounding.
- **Photo feedback/layout:** separate loading indicators cover signed-link
  retrieval and image download, renewed links can recover from old image errors,
  comparison selection buttons have date/category labels and selected states,
  and comparisons stack vertically below 360-point width or above 1.4 font scale.
  Successful photo uploads reset mutation state; inactive upload mutations are
  garbage-collected immediately to reduce base64 retention in memory.

No changes were made to workout persistence, database security, signed-link
expiry, upload retry identities, measurements or record calculations.

## Verification

Automated regressions cover keyboard configuration and unique accessory IDs,
error/retry accessibility, checked/disabled controls, reduced-motion buttons,
profile loading/errors, photo page replacement/back-navigation, inactive photo
queries, and all previous authentication/workout/progress/photo tests.

```sh
npm run typecheck
npm run lint
npm test -- --runInBand --watchman=false
```

All 145 assertions passed during this pass, along with TypeScript and lint.
The full Jest process still remained alive after reporting its results and was
stopped manually; its existing teardown issue is not claimed fixed. The focused
polish suites exit normally.

Still requires device verification; automated component checks do not establish
native layout, VoiceOver behavior or measured frame-rate/memory improvements:

1. Use iPhone decimal keyboards for workout sets and weight; tap Done and drag
   to dismiss. Confirm fields and Save remain reachable above the keyboard.
2. Enable large accessibility text and VoiceOver. Visit every tab and form;
   check labels, reading order, selected states, error messages and retry buttons.
3. Toggle Reduce Motion while the app is open. Verify no unwanted entrance/press
   motion and no content stuck transparent or scaled.
4. Browse at least three photo pages, compare photos across pages and return
   to newer pages. Verify chronological comparison and category isolation.
5. Switch away from Photos, return after five minutes, and verify link renewal.
   Test a slow/offline connection: loading → image or retry, never silent blanks.
6. Recheck sign-in, workout completion, weight/measurement saves, upload and
   account switching. Production release checks remain **Phase 8**.

This pass does not add editing/deletion, persistent offline photo drafts, orphan
upload cleanup, advanced charts or haptics. Existing documented limits remain.
