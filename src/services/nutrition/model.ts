import { z } from 'zod';
import type { NutritionValues } from './calculations';

export const foodSources = ['usda', 'open_food_facts', 'custom'] as const;
export type FoodSource = (typeof foodSources)[number];

export const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof mealTypes)[number];
export const mealTypeOptions = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
] as const satisfies readonly { value: MealType; label: string }[];

export const quantityUnits = ['g', 'ml', 'oz', 'serving'] as const;
export type QuantityUnit = (typeof quantityUnits)[number];

// The normalized cross-provider food model (see PROGRESS_APP_SPEC.md §Nutrition).
// This is the one shape the rest of the app deals with, regardless of whether
// it came from the search-foods Edge Function or a cached `foods` row.
export const foodSchema = z.object({
  id: z.string(),
  source: z.enum(foodSources),
  sourceFoodId: z.string().nullable(),
  name: z.string().min(1),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  servingSize: z.coerce.number().positive().nullable(),
  servingUnit: z.enum(['g', 'ml', 'oz']).nullable(),
  calories: z.coerce.number().min(0),
  proteinG: z.coerce.number().min(0),
  carbsG: z.coerce.number().min(0),
  fatG: z.coerce.number().min(0),
  fiberG: z.coerce.number().min(0).nullable(),
  sugarG: z.coerce.number().min(0).nullable(),
  sodiumMg: z.coerce.number().min(0).nullable(),
});
export type Food = z.infer<typeof foodSchema>;

const foodRowSchema = z.object({
  id: z.string(),
  source: z.enum(foodSources),
  source_food_id: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  serving_size: z.coerce.number().nullable(),
  serving_unit: z.enum(['g', 'ml', 'oz']).nullable(),
  calories: z.coerce.number(),
  protein_g: z.coerce.number(),
  carbs_g: z.coerce.number(),
  fat_g: z.coerce.number(),
  fiber_g: z.coerce.number().nullable(),
  sugar_g: z.coerce.number().nullable(),
  sodium_mg: z.coerce.number().nullable(),
});

// Reads directly from the `foods` cache table are snake_case like every
// other table row in this app; this is the one adapter into the normalized
// Food shape shared with the search-foods Edge Function response.
export function foodFromRow(row: unknown): Food {
  const parsed = foodRowSchema.parse(row);
  return {
    id: parsed.id,
    source: parsed.source,
    sourceFoodId: parsed.source_food_id,
    name: parsed.name,
    brand: parsed.brand,
    barcode: parsed.barcode,
    servingSize: parsed.serving_size,
    servingUnit: parsed.serving_unit,
    calories: parsed.calories,
    proteinG: parsed.protein_g,
    carbsG: parsed.carbs_g,
    fatG: parsed.fat_g,
    fiberG: parsed.fiber_g,
    sugarG: parsed.sugar_g,
    sodiumMg: parsed.sodium_mg,
  };
}

export function foodNutritionBasis(food: Food): NutritionValues {
  return {
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    fiberG: food.fiberG,
    sugarG: food.sugarG,
    sodiumMg: food.sodiumMg,
  };
}

// The basis quantity a food's stored nutrition values apply to: `serving` if
// the food has a defined serving size/unit, otherwise 100 g/ml.
export function foodBasisQuantity(food: Food): number {
  return food.servingSize ?? 100;
}
export function foodBasisUnit(food: Food): QuantityUnit {
  return food.servingSize ? 'serving' : food.servingUnit ?? 'g';
}

export const foodEntrySchema = z.object({
  id: z.string(),
  food_id: z.string(),
  meal_type: z.enum(mealTypes),
  consumed_at: z.string(),
  local_date: z.string(),
  quantity: z.coerce.number(),
  unit: z.enum(quantityUnits),
  calories: z.coerce.number(),
  protein_g: z.coerce.number(),
  carbs_g: z.coerce.number(),
  fat_g: z.coerce.number(),
  fiber_g: z.coerce.number().nullable(),
  sugar_g: z.coerce.number().nullable(),
  sodium_mg: z.coerce.number().nullable(),
  foods: z
    .object({ name: z.string(), brand: z.string().nullable() })
    .nullable()
    .optional(),
});
export type FoodEntry = z.infer<typeof foodEntrySchema>;

export function entryNutrition(entry: FoodEntry): NutritionValues {
  return {
    calories: entry.calories,
    proteinG: entry.protein_g,
    carbsG: entry.carbs_g,
    fatG: entry.fat_g,
    fiberG: entry.fiber_g,
    sugarG: entry.sugar_g,
    sodiumMg: entry.sodium_mg,
  };
}

export const nutritionTargetSchema = z.object({
  id: z.string(),
  calories: z.coerce.number(),
  protein_g: z.coerce.number(),
  carbs_g: z.coerce.number(),
  fat_g: z.coerce.number(),
  effective_from: z.string(),
});
export type NutritionTarget = z.infer<typeof nutritionTargetSchema>;

export type LogFoodEntryInput = {
  clientId: string;
  foodId: string;
  mealType: MealType;
  consumedAt: string;
  localDate: string;
  quantity: number;
  unit: QuantityUnit;
  nutrition: NutritionValues;
};

export type SetNutritionTargetInput = {
  clientId: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  effectiveFrom: string;
};

// EAN-8, UPC-A, EAN-13 and GTIN-14 cover the barcode formats a packaged
// grocery product actually uses; mirrors the Edge Function's own check.
export const barcodePattern = /^\d{8,14}$/;

export const customFoodSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(200),
  brand: z.string().trim().max(200).nullable(),
  calories: z.coerce.number().min(0).max(5000),
  proteinG: z.coerce.number().min(0).max(1000),
  carbsG: z.coerce.number().min(0).max(1000),
  fatG: z.coerce.number().min(0).max(1000),
  fiberG: z.coerce.number().min(0).max(1000).nullable(),
  sugarG: z.coerce.number().min(0).max(1000).nullable(),
  sodiumMg: z.coerce.number().min(0).max(100000).nullable(),
});
export type CustomFoodInput = z.infer<typeof customFoodSchema>;

export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// Shared with Home's nutrition card, which shows a quiet "not set up yet"
// state for this specific case instead of a loud error (mirrors how
// homeService.getRecentWorkout already treats a missing workouts table).
export function isNutritionSetupMissing(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  return ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code);
}

export function nutritionError(error: unknown) {
  if (isNutritionSetupMissing(error)) {
    return 'Nutrition setup is needed. Apply the Phase 9 SQL migration in Supabase, then retry.';
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (code === '42501') {
    return 'Access denied. Check that you are signed in to the correct account.';
  }
  return 'Could not complete the request. Check your connection and retry.';
}
