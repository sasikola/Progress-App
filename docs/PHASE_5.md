# Phase 5 — Progress

## Setup

1. Keep the existing Phase 4 workout and profile compatibility migrations applied.
2. Run the **entire** `supabase/migrations/202609250002_phase5_progress.sql` in
   Supabase SQL Editor as the project administrator.
3. Reload the Metro-connected development app and open **Progress**. No additional
   packages, credentials, pods, or native rebuild are required.

This migration adds measurements, nullable request IDs on weight/measurement
entries, indexes, owner-only measurement policies, and four SECURITY INVOKER RPCs.
Existing records are preserved; rerunning does not clear data. The existing
profile migration supplies weight-entry RLS. Do not disable RLS or delete tables
to resolve a schema error: report the error and existing table definition instead.
Existing measurement tables must have the spec's `user_id`, `measurement_type`,
`value`, `unit`, `recorded_at` and `id` columns with compatible types/constraints.

## Implemented

- **Overview:** all-time completed workouts, completed-set counts and total load ×
  reps volume in kg, plus current/previous body weight and neutral change text.
  Aggregates run in PostgreSQL rather than downloading all workouts. Older
  workouts without set data contribute no sets/volume.
- **Weight:** log kg/lb, choose a local date, view current and previous entries,
  change, trend chart and paginated history. Existing onboarding weights appear.
- **Measurements:** chest, waist, hips, left/right arms and left/right thighs,
  each with separate cm/in entries, history and trends.
- **Records:** best completed set per exercise, ranked by normalized kg load
  (four decimal places), then reps. Ties show the first occurrence. Original
  weight/unit, reps and date are shown. Unfinished workouts and incomplete sets
  are excluded. First performances are baselines, not claimed new PRs. There are
  no estimated 1RM claims or medical interpretations.
- Independent loading, empty, setup-error and retry states; pull-to-refresh and
  refresh on tab focus. Saving a weight refreshes Home; finishing a workout
  invalidates Progress summaries and records. Query keys include the user ID,
  reads are scoped by server-side `auth.uid()`, and writes verify the supplied owner.

## Entry and chart behavior

- Entries require a finite value greater than zero and less than 1000 in the
  entered unit. Measurements must also be less than 1000 cm when using inches.
  Numeric validation rejects exponent notation, negative and blank values.
- Date input is `YYYY-MM-DD`, 1900 through today, in the device's local timezone.
  Today's entries use the submission time; historical entries use local noon.
- The selected unit controls input and chart display. Changing it **does not**
  convert the typed number. Charts convert existing mixed-unit readings into
  one unit; history always displays original values/units.
- History uses 20-row pages with a timestamp/ID cursor for stable ordering even
  when timestamps match. Only requested pages are fetched. Records use 20-row
  pages, with refresh after newly saved workouts.
- Charts show the most recent **up to 30 loaded readings**, with actual time
  spacing, visible units/date bounds and a clearly marked zoomed vertical axis.
  Load older entries to extend the initial 20-reading chart. Exact values remain
  readable in history. Charts handle flat values and repeated timestamps and
  use native views without introducing a native chart dependency.
- One form submission is allowed at a time. Retrying an unchanged entry while
  the form remains open reuses its request ID/timestamp; the database returns
  the existing entry after a lost response instead of inserting it again.
  If a response is uncertain, retry unchanged before editing. Input/request IDs
  are in memory only: there is no offline queue or recovery across restarts.
  Switching section/body area discards unsubmitted form input, as stated onscreen.
- Entry editing/deletion, profile unit-preference editing, advanced chart range
  filters and photos are not included. Photos remain Phase 6.

## Verification

Automated checks:

```sh
npm run typecheck
npm run lint
npm test -- --runInBand --watchman=false
npm run test:progress-db
```

The isolated PostgreSQL check applies all prerequisites and tests fresh and
existing-measurement schemas, preservation, reruns, validation, duplicate-free
retries, cursor pagination, mixed-unit record ranking, overview and cross-user/
anonymous access. It never connects to the real Supabase project.

Device/live acceptance (still required after deployment):

1. Open Overview and compare its totals to completed workouts.
2. Log two weights on different dates, including kg/lb; check history, chart,
   change and Home, then restart to verify persistence.
3. Log two waist entries using cm/in. Switch body area and confirm separation.
4. Disconnect, attempt save, reconnect and retry unchanged; confirm one entry.
5. Finish workouts with increasing loads; check Records. Test an empty account.
6. Test two accounts: neither should see the other's entries, summaries or lifts.
7. Check small screens, large text, VoiceOver, and date entry on a real iPhone.

The native chart has automated geometry checks but has not been visually
verified on a simulator/device in this implementation session.
