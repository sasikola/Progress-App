// Deploy: supabase functions deploy get-food-by-barcode
// No extra secret needed: Open Food Facts' read API is public and keyless.
//
// JWT verification is enforced by the platform at deploy time (the default;
// do not deploy with --no-verify-jwt), so only signed-in app users reach this
// code. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
// by the Edge Functions runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { foodToInsertRow, rowToFood, type FoodRow } from '../_shared/food.ts';
import {
  fetchOffProductByBarcode,
  OpenFoodFactsProviderError,
} from '../_shared/openFoodFacts.ts';

const foodColumns =
  'id, source, source_food_id, name, brand, barcode, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg';

// Tags a Postgrest failure with which step produced it (see search-foods,
// which this mirrors) so the response says "cache read" vs "cache write"
// instead of one opaque message for every possible database problem.
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

  let barcode: string;
  try {
    const body = await request.json();
    barcode = typeof body?.barcode === 'string' ? body.barcode.trim() : '';
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  // EAN-8, UPC-A, EAN-13 and GTIN-14 cover the barcode formats a packaged
  // grocery product actually uses.
  if (!/^\d{8,14}$/.test(barcode)) {
    return json({ error: 'barcode must be 8 to 14 digits.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('get-food-by-barcode misconfigured: missing Supabase env vars');
    return json({ error: 'Barcode lookup is not available right now.' }, 500);
  }
  // Service-role key intentionally bypasses RLS to maintain the shared
  // provider-food cache; it never leaves this function. Only `source =
  // 'open_food_facts'` rows are ever touched here.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: cachedRow, error: cacheError } = await admin
      .from('foods')
      .select(foodColumns)
      .eq('barcode', barcode)
      .maybeSingle();
    if (cacheError) {
      throw new StageError('cache_read', cacheError.message ?? String(cacheError));
    }
    if (cachedRow) {
      return json({ food: rowToFood(cachedRow as FoodRow) });
    }

    const fresh = await fetchOffProductByBarcode(barcode);
    if (fresh === null) {
      // A real, common outcome (unrecognized or unusable product data),
      // not an error — the client shows "not found", not a failure state.
      return json({ food: null });
    }

    const { data: upserted, error: upsertError } = await admin
      .from('foods')
      .upsert([foodToInsertRow(fresh)], { onConflict: 'source,source_food_id' })
      .select(foodColumns)
      .single();
    if (upsertError) {
      throw new StageError('cache_write', upsertError.message ?? String(upsertError));
    }
    return json({ food: rowToFood(upserted as FoodRow) });
  } catch (cause) {
    console.error('get-food-by-barcode failed', cause);
    if (cause instanceof OpenFoodFactsProviderError) {
      return json(
        {
          error: `We couldn't reach Open Food Facts (${cause.message}). Try again.`,
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
    return json({ error: "We couldn't look up that barcode. Try again." }, 500);
  }
});
