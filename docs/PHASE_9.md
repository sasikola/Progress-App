# Phase 9 — Nutrition, calorie and macro tracking (Milestone 1)

## Setup

1. Run **all** of `supabase/migrations/202609260001_phase9_nutrition.sql` in the
   project's Supabase SQL Editor as administrator. It creates `foods`,
   `food_entries`, `nutrition_targets`, RLS policies, and the
   `log_food_entry`/`set_nutrition_target` RPCs. Purely additive; does not
   touch workouts, profiles, progress, or photos tables.
2. Sign up for a USDA FoodData Central API key at
   <https://fdc.nal.usda.gov/api-guide/> (free, personal-use tier is enough
   for development).
3. Deploy the Edge Function and set the key as a function secret — **never**
   as a client `.env` value:

   ```sh
   supabase functions deploy search-foods
   supabase secrets set USDA_API_KEY=<your key>
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically
   by the Edge Functions runtime; nothing else to configure. JWT verification
   is on by default for the deployed function, so only signed-in app users
   can call it — do not deploy with `--no-verify-jwt`.
4. No new npm dependencies and no native changes. Open **Progress → Nutrition**.

## Implementation

- **Data model**: `foods` is a shared, provider-populated cache (USDA today;
  `open_food_facts`/`custom` sources are reserved for later milestones — the
  schema and RLS already distinguish a private custom food from a shared
  provider food, but no custom-food UI ships in this milestone).
  `food_entries` stores a **snapshot** of the nutrition used at logging
  time (never recomputed from the current `foods` row), so a later catalog
  correction cannot silently rewrite historical days. `nutrition_targets` is
  versioned by `effective_from`, like weight/measurement history, so past
  days compare against the target that applied on that day.
- **Local-day grouping**: `food_entries.local_date` is computed on the device
  from the user's local clock at log time (`localDay()`), not derived from a
  UTC truncation of `consumed_at` server-side, so a late-night entry stays on
  the calendar day the user actually experienced.
- **Search caching**: `search-foods` checks the `foods` cache (`ilike` on
  name, `source = 'usda'` only) before calling USDA. Five or more cached
  matches skip the provider call entirely; otherwise fresh USDA results are
  normalized, filtered (a food missing any of calories/protein/carbs/fat is
  dropped rather than shown with a fabricated zero), upserted into the cache
  with the service-role key, and merged with any existing cache hits.
- **Client-side calculation engine**: `src/services/nutrition/calculations.ts`
  is pure and dependency-free — quantity/serving scaling, daily totals,
  remaining-vs-target, and an optional Mifflin-St Jeor calorie/macro
  estimator (clearly presented as an editable estimate, never as medical
  advice, with a 1200 kcal safety floor). A single rounding pass happens at
  the end of each calculation, never on intermediate values.
- **Security**: RLS restricts `food_entries`/`nutrition_targets` to their
  owner for every command (select/insert/update/delete). `foods` has no
  client-side insert/update grant — only the Edge Function's service-role key
  writes the shared cache — and a `source = 'custom'` row is only visible to
  its `created_by` owner, ready for the custom-food milestone without a
  schema change.
- **Screens**: a single `NutritionScreen` with in-place views (mirrors the
  existing Workout tab's pattern rather than adding a second navigator) —
  home dashboard, food search, food detail/serving with a live preview, and
  target setup. A `Nutrition` tab sits between Workout and Progress.

## Verification

Commands:

```sh
npm run typecheck
npm run lint
npm test -- --runInBand --watchman=false
npm run test:nutrition-db
```

The database check models the Phase 9 SQL schema in local PostgreSQL; it
tests idempotent inserts/target-versioning, validation, cross-user RLS
isolation (including a private custom food and anon denial), and rerun
safety. It does **not** test the live Edge Function, the real USDA API, or
Deno's `npm:` import resolution.

Still required on the device/live project:

1. Deploy `search-foods` and set `USDA_API_KEY`, then search for a real food
   and confirm results look correct end to end.
2. Add a food to each meal, edit its quantity, and delete an entry; confirm
   totals update and RLS keeps a second account from seeing the first
   account's entries.
3. Set a target (with and without the estimate helper) and confirm the home
   dashboard's calorie/macro bars and remaining/over-target messaging.
4. Confirm a second, later day starts its own empty log (local-date
   grouping) and that a target set for a future `effective_from` doesn't
   apply to today.

## Deferred to later milestones (see PROGRESS_APP_SPEC.md)

Open Food Facts integration, barcode scanning, recent/favorite foods, custom
food creation, nutrition history/weekly charts, and Home-dashboard
integration are intentionally out of scope for this milestone.
