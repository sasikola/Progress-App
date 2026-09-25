// Deploy: supabase functions deploy search-foods
// Secret: supabase secrets set USDA_API_KEY=<key from https://fdc.nal.usda.gov/api-guide/>
//
// JWT verification is enforced by the platform at deploy time (the default;
// do not deploy with --no-verify-jwt), so only signed-in app users reach this
// code. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
// by the Edge Functions runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { foodToInsertRow, rowToFood, type FoodRow } from '../_shared/food.ts';
import {
  searchUsdaFoods,
  UsdaProviderError,
  UsdaRateLimitError,
} from '../_shared/usda.ts';

const CACHE_HIT_THRESHOLD = 5;
const foodColumns =
  'id, source, source_food_id, name, brand, barcode, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg';

// Tags a Postgrest failure with which step produced it, so the response
// (and the log) says "cache read" vs "cache write" instead of one opaque
// message for every possible database problem.
class StageError extends Error {
  stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.stage = stage;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  let query: string;
  try {
    const body = await request.json();
    query = typeof body?.query === 'string' ? body.query.trim() : '';
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  if (query.length < 2 || query.length > 100) {
    return json({ error: 'query must be 2 to 100 characters.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const usdaApiKey = Deno.env.get('USDA_API_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('search-foods misconfigured: missing Supabase env vars');
    return json({ error: 'Search is not available right now.' }, 500);
  }
  // Service-role key intentionally bypasses RLS to maintain the shared
  // provider-food cache; it never leaves this function. Only `source =
  // 'usda'` rows are ever touched here, so a user's private custom foods
  // (a future milestone) are never read or written by this path.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const escaped = query.replace(/[\\%_]/g, match => `\\${match}`);
    const { data: cached, error: cacheError } = await admin
      .from('foods')
      .select(foodColumns)
      .eq('source', 'usda')
      .ilike('name', `%${escaped}%`)
      .order('name')
      .limit(25);
    if (cacheError)
      throw new StageError('cache_read', cacheError.message ?? String(cacheError));
    const cachedRows = (cached ?? []) as FoodRow[];

    if (cachedRows.length >= CACHE_HIT_THRESHOLD) {
      return json({ foods: cachedRows.map(rowToFood) });
    }
    if (!usdaApiKey) {
      // No provider secret configured yet: degrade to whatever is cached
      // instead of failing the whole search.
      return json({ foods: cachedRows.map(rowToFood) });
    }

    const fresh = await searchUsdaFoods(query, usdaApiKey).catch(cause => {
      if (cachedRows.length > 0) return null; // fall back to cache below
      throw cause;
    });
    if (fresh === null) {
      return json({ foods: cachedRows.map(rowToFood) });
    }

    const rows = fresh.map(foodToInsertRow);
    const { data: upserted, error: upsertError } = rows.length
      ? await admin
          .from('foods')
          .upsert(rows, { onConflict: 'source,source_food_id' })
          .select(foodColumns)
      : { data: [] as FoodRow[], error: null };
    if (upsertError)
      throw new StageError('cache_write', upsertError.message ?? String(upsertError));

    // De-duplicate by ID; cache entries first so already-seen foods keep a
    // stable order across repeat searches for the same term.
    const merged = new Map<string, FoodRow>();
    for (const row of cachedRows) merged.set(row.id, row);
    for (const row of (upserted ?? []) as FoodRow[]) merged.set(row.id, row);

    return json({ foods: Array.from(merged.values()).map(rowToFood) });
  } catch (cause) {
    console.error('search-foods failed', cause);
    if (cause instanceof UsdaRateLimitError) {
      return json(
        { error: 'Too many searches right now. Try again shortly.' },
        429,
      );
    }
    // These two branches surface a bounded, non-sensitive detail (a USDA
    // HTTP status/short body, or a Postgrest error message — schema info,
    // never credentials) so setup problems are diagnosable from the app's
    // own error text instead of only from the function's server-side logs.
    if (cause instanceof UsdaProviderError) {
      return json(
        {
          error: `We couldn't reach the USDA food database (${cause.message}). Check the USDA_API_KEY secret and try again.`,
        },
        502,
      );
    }
    if (cause instanceof StageError) {
      return json(
        {
          error: `Nutrition search setup problem during ${cause.stage}: ${cause.message}`,
        },
        500,
      );
    }
    return json({ error: "We couldn't load food results. Try again." }, 500);
  }
});
