import { supabase } from '../../lib/supabase';
import type { NutritionValues } from './calculations';
import {
  foodEntrySchema,
  foodFromRow,
  foodSchema,
  nutritionTargetSchema,
  type CustomFoodInput,
  type Food,
  type FoodEntry,
  type LogFoodEntryInput,
  type NutritionTarget,
  type QuantityUnit,
  type SetNutritionTargetInput,
} from './model';

function client() {
  if (!supabase) throw new Error('Nutrition access is not configured.');
  return supabase;
}

// supabase-js reports every Edge Function failure as one of three opaque
// error classes with no `.code`, so the generic Postgrest-style mapping in
// nutritionError() can't say anything useful about them. Unwrap the ones we
// can — the function's own JSON `{ error: "..." }` body for a non-2xx
// response — and give the rest a message that distinguishes "the function
// isn't deployed/reachable" from "the function ran and rejected the input".
async function edgeFunctionError(
  error: unknown,
  functionName: string,
  fallback: string,
): Promise<Error> {
  if (error instanceof Error && error.name === 'FunctionsHttpError') {
    const response = (error as { context?: Response }).context;
    // A missing function is itself a normal (non-2xx) HTTP response from
    // Supabase's gateway — a FunctionsHttpError, not a FunctionsRelayError —
    // so it must be special-cased here, not assumed to always carry the
    // function's own JSON body.
    if (response?.status === 404) {
      return new Error(
        `${functionName} was not found. Confirm it's deployed: supabase functions deploy ${functionName}`,
      );
    }
    if (response) {
      try {
        const body = await response.json();
        if (typeof body?.error === 'string') return new Error(body.error);
      } catch {
        // Non-JSON or already-consumed body; fall through to the message below.
      }
      return new Error(`${fallback} (${functionName} responded with ${response.status}.)`);
    }
    return new Error(fallback);
  }
  if (
    error instanceof Error &&
    (error.name === 'FunctionsRelayError' || error.name === 'FunctionsFetchError')
  ) {
    return new Error(
      `This isn't available right now. Confirm the ${functionName} Edge Function is deployed and check your connection.`,
    );
  }
  return error instanceof Error ? error : new Error(fallback);
}

const entryColumns =
  'id, food_id, meal_type, consumed_at, local_date, quantity, unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg';
const foodColumns =
  'id, source, source_food_id, name, brand, barcode, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg';

export const nutritionService = {
  // Cache-first: the Edge Function checks `foods` before calling USDA, so a
  // repeated search for the same term does not repeatedly hit the provider.
  async searchFoods(query: string, signal: AbortSignal): Promise<Food[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const { data, error } = await client().functions.invoke('search-foods', {
      body: { query: trimmed },
      signal,
    });
    if (error)
      throw await edgeFunctionError(
        error,
        'search-foods',
        "We couldn't load food results. Try again.",
      );
    const results = Array.isArray((data as { foods?: unknown[] })?.foods)
      ? (data as { foods: unknown[] }).foods
      : [];
    return foodSchema.array().parse(results);
  },
  async getFood(foodId: string, signal: AbortSignal): Promise<Food> {
    const { data, error } = await client()
      .from('foods')
      .select(foodColumns)
      .eq('id', foodId)
      .abortSignal(signal)
      .single();
    if (error) throw error;
    return foodFromRow(data);
  },
  async logEntry(
    userId: string,
    input: LogFoodEntryInput,
  ): Promise<FoodEntry> {
    const { data, error } = await client().rpc('log_food_entry', {
      p_user_id: userId,
      p_client_id: input.clientId,
      p_food_id: input.foodId,
      p_meal_type: input.mealType,
      p_consumed_at: input.consumedAt,
      p_local_date: input.localDate,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_calories: input.nutrition.calories,
      p_protein_g: input.nutrition.proteinG,
      p_carbs_g: input.nutrition.carbsG,
      p_fat_g: input.nutrition.fatG,
      p_fiber_g: input.nutrition.fiberG,
      p_sugar_g: input.nutrition.sugarG,
      p_sodium_mg: input.nutrition.sodiumMg,
    });
    if (error) throw error;
    return foodEntrySchema.parse(data);
  },
  // Recalculation happens client-side (see calculations.ts) from the food's
  // stored basis; this only persists the new quantity/unit and snapshot.
  async updateEntry(
    entryId: string,
    quantity: number,
    unit: QuantityUnit,
    nutrition: NutritionValues,
  ): Promise<FoodEntry> {
    const { data, error } = await client()
      .from('food_entries')
      .update({
        quantity,
        unit,
        calories: nutrition.calories,
        protein_g: nutrition.proteinG,
        carbs_g: nutrition.carbsG,
        fat_g: nutrition.fatG,
        fiber_g: nutrition.fiberG,
        sugar_g: nutrition.sugarG,
        sodium_mg: nutrition.sodiumMg,
      })
      .eq('id', entryId)
      .select(entryColumns)
      .single();
    if (error) throw error;
    return foodEntrySchema.parse(data);
  },
  async deleteEntry(entryId: string): Promise<void> {
    const { error } = await client()
      .from('food_entries')
      .delete()
      .eq('id', entryId);
    if (error) throw error;
  },
  async entriesForDate(
    userId: string,
    localDate: string,
    signal: AbortSignal,
  ): Promise<FoodEntry[]> {
    const { data, error } = await client()
      .from('food_entries')
      .select(`${entryColumns}, foods(name, brand)`)
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .order('meal_type')
      .order('consumed_at')
      .abortSignal(signal);
    if (error) throw error;
    return foodEntrySchema.array().parse(data ?? []);
  },
  async currentTarget(
    userId: string,
    localDate: string,
    signal: AbortSignal,
  ): Promise<NutritionTarget | null> {
    const { data, error } = await client()
      .from('nutrition_targets')
      .select('id, calories, protein_g, carbs_g, fat_g, effective_from')
      .eq('user_id', userId)
      .lte('effective_from', localDate)
      .order('effective_from', { ascending: false })
      .limit(1)
      .abortSignal(signal);
    if (error) throw error;
    const row = data?.[0];
    return row ? nutritionTargetSchema.parse(row) : null;
  },
  async setTarget(
    userId: string,
    input: SetNutritionTargetInput,
  ): Promise<NutritionTarget> {
    const { data, error } = await client().rpc('set_nutrition_target', {
      p_user_id: userId,
      p_client_id: input.clientId,
      p_calories: input.calories,
      p_protein_g: input.proteinG,
      p_carbs_g: input.carbsG,
      p_fat_g: input.fatG,
      p_effective_from: input.effectiveFrom,
    });
    if (error) throw error;
    return nutritionTargetSchema.parse(data);
  },
  // A manually entered barcode today; the same lookup a future camera
  // scanner would call. Returns null for "not found" — a normal outcome,
  // not an error — and throws only for an actual failure.
  async getFoodByBarcode(
    barcode: string,
    signal: AbortSignal,
  ): Promise<Food | null> {
    const { data, error } = await client().functions.invoke(
      'get-food-by-barcode',
      { body: { barcode }, signal },
    );
    if (error)
      throw await edgeFunctionError(
        error,
        'get-food-by-barcode',
        "We couldn't look up that barcode. Try again.",
      );
    const food = (data as { food?: unknown })?.food;
    return food ? foodSchema.parse(food) : null;
  },
  async recentFoods(signal: AbortSignal): Promise<Food[]> {
    const { data, error } = await client()
      .rpc('recent_foods', { p_limit: 10 })
      .abortSignal(signal);
    if (error) throw error;
    return (data ?? []).map(foodFromRow);
  },
  async favoriteFoods(userId: string, signal: AbortSignal): Promise<Food[]> {
    const { data, error } = await client()
      .from('favorite_foods')
      .select(`food_id, foods(${foodColumns})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .abortSignal(signal);
    if (error) throw error;
    return (data ?? []).map(row => foodFromRow((row as { foods: unknown }).foods));
  },
  // Idempotent by design (ON CONFLICT DO NOTHING): a retried tap on an
  // already-favorited food is a no-op, not a duplicate-row error.
  async addFavorite(userId: string, foodId: string): Promise<void> {
    const { error } = await client()
      .from('favorite_foods')
      .upsert(
        { user_id: userId, food_id: foodId },
        { onConflict: 'user_id,food_id', ignoreDuplicates: true },
      );
    if (error) throw error;
  },
  async removeFavorite(userId: string, foodId: string): Promise<void> {
    const { error } = await client()
      .from('favorite_foods')
      .delete()
      .eq('user_id', userId)
      .eq('food_id', foodId);
    if (error) throw error;
  },
  async myCustomFoods(userId: string, signal: AbortSignal): Promise<Food[]> {
    const { data, error } = await client()
      .from('foods')
      .select(foodColumns)
      .eq('source', 'custom')
      .eq('created_by', userId)
      .order('name')
      .abortSignal(signal);
    if (error) throw error;
    return (data ?? []).map(foodFromRow);
  },
  async createCustomFood(
    userId: string,
    input: CustomFoodInput,
  ): Promise<Food> {
    const { data, error } = await client()
      .from('foods')
      .insert({
        source: 'custom',
        created_by: userId,
        name: input.name,
        brand: input.brand ?? null,
        calories: input.calories,
        protein_g: input.proteinG,
        carbs_g: input.carbsG,
        fat_g: input.fatG,
        fiber_g: input.fiberG ?? null,
        sugar_g: input.sugarG ?? null,
        sodium_mg: input.sodiumMg ?? null,
      })
      .select(foodColumns)
      .single();
    if (error) throw error;
    return foodFromRow(data);
  },
};
