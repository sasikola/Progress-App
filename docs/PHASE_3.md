# Phase 3 — Home dashboard

Home now reads the signed-in user's saved name/goal from `profiles` and their
two latest entries from `weight_entries`. It shows the latest weight with its
recording date, plus a neutral change since the previous entry when available.
Mixed kg/lb entries are converted to the latest entry's unit before comparison.

The recent-workout card reads the latest completed row from `workouts`, using the
spec's `id`, `user_id`, `started_at`, `completed_at`, and `duration_seconds` contract.
Unfinished workouts are excluded. A missing workouts table is explicitly marked
unavailable because Phase 4 owns its creation. Other query errors are not hidden
as empty records. Existing Phase 2 tables and own-user RLS remain required.

Each query is scoped to the signed-in user and cached under that user's ID;
requests consume cancellation signals. The auth provider clears caches on account
changes. Pull-to-refresh updates all cards; returning to Home refreshes weight and
workout summaries. Independent loading/error/retry states prevent a failed workout
query from hiding the weight summary.

## Phase dependencies

- Start Workout navigates to the existing Workout tab. It does **not** create an
  active session yet: exercise selection, sets/reps, and finishing a workout are
  Phase 4. This limitation is stated next to the button in this development build.
- Personal records await exercise/set data; no invented records or counts appear.
- Photo reminders are deferred until photo capture/history and reminder criteria
  exist. Weight-entry creation beyond onboarding remains in the Progress phase.
- No database writes, migrations, new native dependencies, or environment changes
  were introduced. The earlier onboarding save/retry issue is not changed here.

## Verification

TypeScript, ESLint, formatting, and all 69 tests across 19 suites passed. Test
query-client cleanup/GC settings were adjusted to avoid retaining cache timers.
The full suite still reports an open asynchronous handle after finishing; it
was stopped after reporting results. That test-runner cleanup remains unresolved.

Service tests cover query scope, ordering, limits, cancellation forwarding,
missing-table behavior, other error propagation, and mixed-unit comparison.
Home tests cover greeting/goal, populated and empty summaries, loading/errors,
refresh, and navigation. Real Supabase reads and device rendering still require
manual verification with the configured account. Verify with and without starting
weight, then pull to refresh; confirm Start Workout opens the Workout tab.

These are JavaScript-only changes: Fast Refresh/reload is sufficient if the app
was already rebuilt with its Supabase configuration. Full workout-start acceptance
remains dependent on Phase 4; the Home entry point is wired now.
