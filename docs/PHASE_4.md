# Phase 4 — Workout logging

## Setup required before live saving

Open Supabase → SQL Editor and run the complete contents of:

`supabase/migrations/202609230001_phase4_workouts.sql`

The app cannot deploy schema with its public client key. No live database was
changed during implementation. Use the existing Phase 1 environment and Phase 2
profile setup; no new app credentials or native dependencies are required.
Reload the app after applying SQL. No native rebuild is required for these JS changes.

The migration is transactional and can be reapplied to the schema it creates.
It seeds ten exercises, enables RLS, installs own-user policies and two RPCs.
If you already created incompatible workout tables manually, stop and reconcile
their definitions before applying it: `create table if not exists` does not
upgrade an unrelated schema. Existing unrelated policies are not removed; audit
any pre-existing permissive policies separately.

## Implemented flow

- Home's Start Workout creates a draft and opens exercise selection, or resumes
  the existing draft. The Workout tab also offers Start/Resume and History.
- Search/browse a server-backed catalog by exercise name or muscle group. Add
  multiple exercises, with duplicate prevention and catalog descriptions.
- Active session shows an elapsed timer and previous completed sets per exercise.
- Add/edit/delete sets; enter external weight, kg/lb, and whole-number reps;
  mark sets complete or undo completion; add/remove exercises. Destructive
  removal/discard actions require confirmation.
- Editing a completed set unchecks it. Switching units clears the weight field
  so its number is not silently reinterpreted in a different unit.
- Finish confirms that only completed sets are saved, then opens the saved
  summary: duration, exercise/set counts, external-load volume, new load PRs,
  and all exercises/sets. The history view is paginated in groups of 20 and opens
  the same details. Saved sessions invalidate Home and workout query caches.
- Errors/loading/empty states are explicit. Missing tables/RPCs give a setup
  message instead of fake success or fabricated data.

## Draft durability and retries

Drafts use the existing native secure-storage adapter, namespaced by project and
account. Every edit queues a full snapshot; writes/removal are serialized so an
old write cannot resurrect a discarded draft. The UI distinguishes saving, saved,
and failed local saves. Keep the app open if a local save fails and use Retry local
save. A force-kill before a pending write finishes can lose that last edit; the
app does not claim it was durable until the write succeeds.

Leaving the tab or using Save for later keeps the draft. Restarts and signing back
into the same account restore it. Signing out does not erase the draft; another
account cannot see it. Device-only drafts are not cross-device sync or a cloud
backup. Uninstall/device loss can remove them; iOS Keychain persistence varies.
Unreadable/corrupt drafts are not silently overwritten: Retry draft is shown.

Finish freezes the payload and finish timestamp and persists them **before** the
RPC. While finish is pending, editing/discarding that request is locked. Retrying,
including after restarting, sends the same per-user `client_id`. PostgreSQL
serializes matching requests and returns the existing workout when already saved.
The RPC writes parent/children and summary statistics in one transaction; any
invalid set rolls back the whole save. The draft is cleared only after a successful
server response; local-clear failure also safely retries the same request.

The RPC checks the expected account against `auth.uid()` to prevent a pending
draft from being saved under an account that changed during a request.

## Data and calculation contract

- Base tables follow the spec: `exercises`, `workouts`, `workout_exercises`,
  `workout_sets`. Workouts add `client_id` (per-user idempotency), `exercise_count`,
  `set_count`, `volume_kg`, and `records` (a JSON snapshot of achieved load PRs).
- Only completed sessions/sets are uploaded. Abandoned drafts stay local until
  explicitly discarded. Editing/deleting completed history is not implemented.
- Bounds: up to 30 distinct exercises, 20 sets per exercise, weight 0–2,000 in the
  chosen unit, reps 1–1,000. Server constraints and RPC validation enforce bounds.
- Enter 0 for an unweighted bodyweight set. Volume is the sum of external load ×
  reps, normalized to kg, labelled `kg·reps`; body mass is not estimated. Catalog
  descriptions define how to enter barbell, dumbbell, and machine loads.
- PR means the highest external load in a completed set for that exercise,
  compared with previously saved sessions completed no later than this one. A
  0.01 kg tolerance avoids conversion rounding noise. First sessions establish
  baselines, not new PRs. These are **not** estimated 1RM or rep-count records.
- PR snapshots are computed when saving and are not retroactively recalculated
  when an older offline session is uploaded later. Units are normalized to kg.
- Timer uses absolute timestamps so backgrounding does not pause it. Duration
  runs from Start until the first Finish attempt, including breaks.
- All user-owned tables have RLS. Catalog is authenticated-read-only. Both RPCs
  use SECURITY INVOKER, retain RLS, and deny anonymous invocation. No service key
  is bundled. The server, not a client-supplied user ID, owns authorization.

## Verification

Verified locally: TypeScript, ESLint, formatting, all 92 Jest tests across 23
suites, the PostgreSQL migration checks, and both iOS/Android JavaScript bundles
passed. Native device rendering and live Supabase requests remain unverified.
The pre-existing full-suite Jest open-handle warning remains after reporting
passing tests; that process was stopped after collecting results.

Run:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand --watchman=false
npm run test:workout-db
```

`test:workout-db` uses development-only [PGlite](https://pglite.dev/docs/) to run
the actual migration in isolated in-memory PostgreSQL with simulated Supabase
roles and `auth.uid()`. It checks deployment/reapply, RLS isolation, anonymous
denial, expected-account checks, save/rollback, idempotency, summary calculations,
mixed units, previous sets, and load records. It never connects to live Supabase.
It does not test PostgREST configuration or concurrent network requests.

Jest covers inputs, storage ordering/failures, request construction, history
scoping/pagination, and the screen flow through save, summary, and history. The
restart/retry test restores a frozen draft after a simulated network failure.

After applying the migration, manually verify on your phone:

1. Start from Home, search/add two exercises, enter sets and complete them.
2. Edit/delete a set and remove an exercise; verify confirmation and validation.
3. Switch tabs, background, force-close/reopen, and resume the saved draft.
4. Finish while offline; reconnect and retry; confirm exactly one history entry.
5. Verify summary, previous performance on the next session, and Home refresh.
6. Test kg/lb, 0-load bodyweight sets, optional weight-profile setup, large text,
   keyboard access, small screens, and screen-reader labels.
7. Test two accounts: each sees only its own draft, history, and previous sets.

Live end-to-end acceptance remains pending migration deployment and device testing.
The separate profile compatibility migration now makes Phase 2 onboarding saves
atomic and retry-safe; see [Phase 2 setup](PHASE_2.md).
