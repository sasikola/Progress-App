// Mirrors src/services/nutrition/model.ts's `Food` type. Kept as a separate
// copy because Edge Functions deploy independently of the app bundle and run
// on Deno, not the React Native/Node toolchain.
export type FoodSource = 'usda' | 'open_food_facts' | 'custom';

export type NormalizedFood = {
  id: string;
  source: FoodSource;
  sourceFoodId: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSize: number | null;
  servingUnit: 'g' | 'ml' | 'oz' | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

export type FoodRow = {
  id: string;
  source: FoodSource;
  source_food_id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_size: number | null;
  serving_unit: 'g' | 'ml' | 'oz' | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

export function rowToFood(row: FoodRow): NormalizedFood {
  return {
    id: row.id,
    source: row.source,
    sourceFoodId: row.source_food_id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    servingSize: row.serving_size,
    servingUnit: row.serving_unit,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
    sugarG: row.sugar_g,
    sodiumMg: row.sodium_mg,
  };
}

export function foodToInsertRow(food: NormalizedFood) {
  return {
    source: food.source,
    source_food_id: food.sourceFoodId,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
    calories: food.calories,
    protein_g: food.proteinG,
    carbs_g: food.carbsG,
    fat_g: food.fatG,
    fiber_g: food.fiberG,
    sugar_g: food.sugarG,
    sodium_mg: food.sodiumMg,
  };
}
