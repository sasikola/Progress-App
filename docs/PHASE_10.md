# Phase 10 — Open Food Facts, recent/favorite foods, custom foods (Milestone 2, partial)

Barcode *scanning* (camera) is intentionally not part of this phase — it
needs a new native camera dependency and a rebuild, and was deferred by
choice. Everything here works with a manually typed barcode, and the
backend is already shaped so a camera scanner can be added later by calling
the same `get-food-by-barcode` function with a decoded value — no schema or
Edge Function change would be needed.

## Setup

1. Run **all** of `supabase/migrations/202609270001_phase10_nutrition_extras.sql`
   in the project's Supabase SQL Editor, **after** the Phase 9 migration. It
   adds `favorite_foods`, a custom-food insert policy on `foods`, and the
   `recent_foods` RPC. Purely additive.
2. Deploy the new Edge Function — no new secret needed, Open Food Facts'
   read API is public and keyless:

   ```sh
   supabase functions deploy get-food-by-barcode
   ```
3. No new npm dependencies and no native changes.

## Implementation

- **Open Food Facts as a barcode-only provider**: unlike USDA, it is not
  merged into general text search — the spec's own search-priority guidance
  (cache → USDA → Open Food Facts "where appropriate") and "avoid
  unnecessary provider traffic" rule argue against querying a second
  provider for every keystroke when USDA's `Branded` dataset already covers
  packaged foods reasonably well. Instead, `get-food-by-barcode` mirrors
  `search-foods`'s cache-first/normalize/upsert/StageError pattern exactly,
  keyed by barcode instead of a text query, and reuses the *same*
  `(source, source_food_id)` unique index for its upsert conflict target
  (`sourceFoodId` is set to the barcode for Open Food Facts rows).
- **Normalizer bugs from Phase 9 didn't repeat here**: the USDA integration
  shipped with two real bugs (an `ON CONFLICT` target that didn't match a
  partial index, and no sanity-range check on external nutrient values —
  see git history). The Open Food Facts normalizer (`_shared/openFoodFacts.ts`)
  applies the same `min`/`max` sanity bounds as the `foods` table's check
  constraints from the start, and `__tests__/openFoodFactsNormalizer.test.ts`
  covers the same bug classes directly (out-of-range values, missing
  nutrients, unit conversion, name truncation) — this and
  `__tests__/usdaNormalizer.test.ts` are the first tests in the app that
  exercise `supabase/functions/` code under Jest; it works because the
  normalizer logic has no Deno-specific APIs, but `tsc --noEmit` **does**
  pull those files into its program transitively once a test imports them
  (TypeScript's `exclude` only stops auto-discovery, not files reachable
  from an included file) — keep Edge Function *shared* modules portable
  (e.g. `fetch(url.toString())`, not `fetch(url)`) for this reason.
- **Recent foods**: `recent_foods(limit)` groups the caller's `food_entries`
  by `food_id`, taking the latest `consumed_at` per food, so re-logging the
  same food repeatedly still shows once, ordered by most recent use.
- **Favorite foods**: a plain owner-scoped join table. Adding is idempotent
  via `upsert(..., { onConflict: 'user_id,food_id', ignoreDuplicates: true })`
  — a double-tap or retry is a no-op, not a duplicate-row error.
- **Custom foods**: reuse the `foods.created_by`/`source = 'custom'`
  architecture already present in the Phase 9 schema — this phase only adds
  the insert policy/grant and the creation form. Values are entered per
  100 g (no per-serving option in this phase, matching how USDA/Open Food
  Facts foods are normalized), so `foodBasisUnit`/`foodBasisQuantity` stay
  uniform across every source. No idempotency key: unlike meal logging, a
  duplicate custom food from a retried request is low-cost clutter, not a
  correctness problem, so the smallest-coherent implementation was a plain
  insert.
- **UI**: recent and favorite foods appear on the search screen before a
  query is typed; a star toggle appears on every food row (search results,
  recent, favorites, your custom foods); a barcode field sits above the
  results; "Create a custom food" is reachable from the search screen and,
  on success, flows straight into the same add-to-meal detail screen a
  search result would — reducing friction back down to search → add
  regardless of how the food was found.

## Verification

Commands:

```sh
npm run typecheck
npm run lint
npm test -- --runInBand --watchman=false
npm run test:nutrition-db
npm run test:nutrition-extras-db
```

The database check models the Phase 10 SQL schema in local PostgreSQL; it
tests custom-food ownership (including rejecting a spoofed `created_by` and
a spoofed non-custom source), favorite idempotency and cross-user isolation,
`recent_foods` scoping/dedup/limit, and rerun safety. It does **not** test
the live Edge Function or the real Open Food Facts API.

Still required on the device/live project:

1. Deploy `get-food-by-barcode` and look up a real product barcode
   end-to-end.
2. Favorite a few foods, confirm they appear before a search, and that a
   second account never sees them.
3. Log the same food on two different days and confirm "Recent" shows it
   once, most-recently-used first.
4. Create a custom food and confirm no other account can see or search it.

## Still deferred

Barcode scanning (camera), per the scope decision above.
