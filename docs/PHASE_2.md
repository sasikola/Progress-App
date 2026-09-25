# Phase 2 — Onboarding

## Implemented scope

- A 4-step onboarding flow (Profile → Goal → Weight → Complete) shown after
  authentication whenever a user has not completed it, per the root
  navigation flow in the spec.
- Step 1 collects a required name. Step 2 collects a goal from a fixed set
  (Build muscle, Lose fat, Get stronger, Improve fitness, Maintain), stored
  as structured data (`profiles.goal`, a checked text column), not just
  display text. Step 3 collects an optional current body weight with a
  required unit (kg or lb) — skippable. Step 4 shows a read-only summary and
  saves everything in one request.
- Onboarding completion is derived entirely from the `profiles` table
  (`onboarding_completed`), not from any local/device flag. `RootNavigator`
  queries it (via a new `useProfile` hook) alongside the existing
  session/recovery checks and renders `Onboarding`, `Main`, or `Auth`
  accordingly. A returning user with a completed profile skips onboarding
  entirely; a fresh sign-in on a new device also correctly re-enters
  onboarding if no profile exists yet, since nothing is cached locally.
- The You tab (`ProfileScreen`) now shows the saved name, goal, and weight
  unit instead of the Phase 1 placeholder. No editing UI yet — out of this
  phase's checklist, and the spec asks not to overbuild settings in MVP.
- This phase does not add profile/goal/weight editing, unit conversion,
  workout logging, or any Home/Progress data — those remain later phases.

## Required Supabase setup

Run the entire [profile compatibility migration](../supabase/migrations/202609250001_profile_compatibility.sql)
in your project's Supabase SQL Editor as administrator, then reload the app.
This is separate from the Phase 4 workout migration; no native rebuild or new
credentials are needed. This replaces the old setup snippet in this document.

The confirmed database uses `profiles.id` as both its primary key and the
foreign key to `auth.users.id`. The app reads by `id`; it must not query a
nonexistent `profiles.user_id` or generate an independent profile ID.

The migration preserves existing profile data, adds `weight_unit` and
`onboarding_completed`, creates `weight_entries` if missing, and installs the
transactional `complete_onboarding` function and owner-only RLS policies.
It is safe to rerun on the reported schema. If a separate `profiles.user_id`
column exists, it stops for inspection rather than rewriting identities.
Unknown existing restrictive policies and triggers are retained; local tests
cannot verify policies/triggers not supplied with the schema.

Existing rows without a completion flag default to incomplete: users will
complete onboarding once. The migration does not infer completion from a name
or goal. Previously completed flags are preserved on rerun.

The service translates UI goal keys without changing the database constraint:

| App key           | Database value    |
| ----------------- | ----------------- |
| `build_muscle`    | `muscle_gain`     |
| `lose_fat`        | `fat_loss`        |
| `get_stronger`    | `strength`        |
| `improve_fitness` | `general_fitness` |
| `maintain`        | `maintenance`     |

Legacy null goals remain null until onboarding supplies a choice.

Notes:

- `weight_unit` on `profiles` is a schema addition beyond the spec's literal
  column list, kept so later screens (Home, Progress, You) know which unit
  to display in, independent of any single logged `weight_entries.unit`.
- `weight_entries` has no update/delete policy yet — it's an intentional,
  append-only log; Phase 2 has no edit/delete UI for it.
- No new environment variables — this reuses `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` from Phase 1.

## Onboarding data contract

- Draft answers (`name`, `goal`, `weightValue`, `weightUnit`) are held in an
  in-memory React context scoped to the onboarding stack
  (`OnboardingProvider`), not persisted anywhere until the final step. This
  means quitting the app mid-flow loses progress and restarts at Step 1 —
  intentional, since the spec doesn't ask for partial-progress persistence.
- The Complete step calls `complete_onboarding` once. This SECURITY INVOKER
  function checks the authenticated owner and saves the profile and optional
  weight in one transaction. A failure rolls back both. A per-user lock and
  completion check make retries return the saved profile without duplicating
  the starting weight. This is a one-time onboarding operation, not a profile
  editing endpoint. It updates `updated_at` on an existing profile and leaves
  unrelated fields (including date of birth and height) untouched.
- `RootNavigator`'s onboarding gate and the mutation share the same
  TanStack Query cache key (`['profile', userId]`); a successful completion
  writes the fresh profile straight into that cache, so the app moves to
  Main immediately with no extra round-trip. `AuthProvider` already clears
  the whole query cache on sign-in/out/account switch, so this key is
  always fresh per session.

## Verification and remaining acceptance

Verified locally:

- `npm run test:profile-db` runs isolated PostgreSQL checks against fresh and
  reported legacy schemas: reruns, data preservation, cross-user/anonymous
  restrictions, goal validation, transaction rollback, skipped weight and
  duplicate-free retries. It does not connect to your live Supabase project.
- Profile service Jest tests cover ID lookup, all five goal mappings, nullable
  legacy goals, RPC arguments and errors. Run with `npm test -- --runInBand`.

Not yet verified (needs a configured `.env`, the migration applied, and a
real test account, same caveat as Phase 1):

- Live RLS and `complete_onboarding` behavior with your project's existing
  policies and triggers, including a retry after a lost network response.
- End-to-end manual walkthrough: sign up → complete all 4 steps (once
  skipping weight, once providing it) → land on Home → force-quit and
  relaunch → land directly on Main → confirm the You tab shows the saved
  name/goal/unit.
