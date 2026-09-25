import {
  foodBasisQuantity,
  foodBasisUnit,
  foodFromRow,
  foodNutritionBasis,
  foodSchema,
  isNutritionSetupMissing,
  localDay,
  nutritionError,
} from '../src/services/nutrition/model';

test('maps a snake_case foods row into the normalized camelCase Food model', () => {
  const food = foodFromRow({
    id: 'food-1',
    source: 'usda',
    source_food_id: 'fdc-171077',
    name: 'Chicken breast',
    brand: null,
    barcode: null,
    serving_size: 100,
    serving_unit: 'g',
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: 74,
  });
  expect(food).toEqual({
    id: 'food-1',
    source: 'usda',
    sourceFoodId: 'fdc-171077',
    name: 'Chicken breast',
    brand: null,
    barcode: null,
    servingSize: 100,
    servingUnit: 'g',
    calories: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    fiberG: null,
    sugarG: null,
    sodiumMg: 74,
  });
  expect(foodNutritionBasis(food)).toEqual({
    calories: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    fiberG: null,
    sugarG: null,
    sodiumMg: 74,
  });
});

test('rejects a malformed edge-function food payload rather than passing it through', () => {
  expect(() =>
    foodSchema.parse({
      id: 'x',
      source: 'usda',
      sourceFoodId: null,
      name: '',
      brand: null,
      barcode: null,
      servingSize: null,
      servingUnit: null,
      calories: -5,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
    }),
  ).toThrow();
  expect(() =>
    foodSchema.parse({
      id: 'x',
      source: 'unknown-provider',
      sourceFoodId: null,
      name: 'Mystery food',
      brand: null,
      barcode: null,
      servingSize: null,
      servingUnit: null,
      calories: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
    }),
  ).toThrow();
});

test('uses the serving basis when present, otherwise falls back to 100g', () => {
  const withServing = foodFromRow({
    id: 'a', source: 'usda', source_food_id: null, name: 'Bar', brand: null, barcode: null,
    serving_size: 45, serving_unit: 'g', calories: 200, protein_g: 5, carbs_g: 22, fat_g: 8,
    fiber_g: null, sugar_g: null, sodium_mg: null,
  });
  expect(foodBasisQuantity(withServing)).toBe(45);
  expect(foodBasisUnit(withServing)).toBe('serving');
  const per100 = foodFromRow({
    id: 'b', source: 'usda', source_food_id: null, name: 'Rice', brand: null, barcode: null,
    serving_size: null, serving_unit: null, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3,
    fiber_g: null, sugar_g: null, sodium_mg: null,
  });
  expect(foodBasisQuantity(per100)).toBe(100);
  expect(foodBasisUnit(per100)).toBe('g');
});

test('local day formats using the local calendar date, zero-padded', () => {
  expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  expect(localDay(new Date(2026, 8, 25))).toBe('2026-09-25');
});

test('classifies missing-schema error codes for a quiet setup-needed state elsewhere (e.g. Home)', () => {
  expect(isNutritionSetupMissing({ code: 'PGRST205' })).toBe(true);
  expect(isNutritionSetupMissing({ code: '42P01' })).toBe(true);
  expect(isNutritionSetupMissing({ code: '42501' })).toBe(false);
  expect(isNutritionSetupMissing(new Error('network down'))).toBe(false);
});

test('maps schema-missing errors to a setup message and leaves other errors generic', () => {
  expect(nutritionError({ code: 'PGRST205' })).toContain('Phase 9');
  expect(nutritionError({ code: '42501' })).toContain('Access denied');
  expect(nutritionError(new Error('network down'))).not.toContain('Phase 9');
});
