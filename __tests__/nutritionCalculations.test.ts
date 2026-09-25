import {
  calculateDailyNutrition,
  calculateNutritionForQuantity,
  calculateNutritionForServing,
  calculateRemaining,
  estimateCalorieTarget,
  estimateMacroTargets,
  type NutritionValues,
} from '../src/services/nutrition/calculations';

const chickenPer100g: NutritionValues = {
  calories: 165,
  proteinG: 31,
  carbsG: 0,
  fatG: 3.6,
  fiberG: null,
  sugarG: null,
  sodiumMg: 74,
};

test('scales per-100g nutrition to the selected quantity without hardcoding', () => {
  expect(calculateNutritionForQuantity(chickenPer100g, 100)).toEqual(
    chickenPer100g,
  );
  expect(calculateNutritionForQuantity(chickenPer100g, 200)).toEqual({
    calories: 330,
    proteinG: 62,
    carbsG: 0,
    fatG: 7.2,
    fiberG: null,
    sugarG: null,
    sodiumMg: 148,
  });
  expect(calculateNutritionForQuantity(chickenPer100g, 50)).toEqual({
    calories: 83,
    proteinG: 15.5,
    carbsG: 0,
    fatG: 1.8,
    fiberG: null,
    sugarG: null,
    sodiumMg: 37,
  });
});

test('rejects a non-positive quantity or serving count', () => {
  expect(() => calculateNutritionForQuantity(chickenPer100g, 0)).toThrow();
  expect(() => calculateNutritionForQuantity(chickenPer100g, -5)).toThrow();
  expect(() =>
    calculateNutritionForServing(chickenPer100g, 0),
  ).toThrow();
});

test('scales per-serving nutrition by the number of servings', () => {
  const perServing: NutritionValues = {
    calories: 120,
    proteinG: 5,
    carbsG: 22,
    fatG: 2,
    fiberG: 3,
    sugarG: 8,
    sodiumMg: 150,
  };
  expect(calculateNutritionForServing(perServing, 2)).toEqual({
    calories: 240,
    proteinG: 10,
    carbsG: 44,
    fatG: 4,
    fiberG: 6,
    sugarG: 16,
    sodiumMg: 300,
  });
  expect(calculateNutritionForServing(perServing, 1.5)).toEqual({
    calories: 180,
    proteinG: 7.5,
    carbsG: 33,
    fatG: 3,
    fiberG: 4.5,
    sugarG: 12,
    sodiumMg: 225,
  });
});

test('sums multiple meals and foods into daily totals with a single final rounding', () => {
  const entries: NutritionValues[] = [
    { calories: 216, proteinG: 12.6, carbsG: 1.2, fatG: 14.4, fiberG: null, sugarG: null, sodiumMg: 372 },
    { calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, fiberG: 3.1, sugarG: 14.4, sodiumMg: 1 },
    { calories: 150, proteinG: 8, carbsG: 12, fatG: 8, fiberG: null, sugarG: 12, sodiumMg: 105 },
  ];
  expect(calculateDailyNutrition(entries)).toEqual({
    calories: 471,
    proteinG: 21.9,
    carbsG: 40.2,
    fatG: 22.8,
    fiberG: 3.1,
    sugarG: 26.4,
    sodiumMg: 478,
  });
});

test('daily totals for zero entries are all zero, with unknown optionals staying null', () => {
  expect(calculateDailyNutrition([])).toEqual({
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
  });
});

test('reports remaining nutrition under, exactly at, and over target', () => {
  const target = { calories: 2400, proteinG: 170, carbsG: 260, fatG: 70 };
  expect(
    calculateRemaining(target, { calories: 1840, proteinG: 132, carbsG: 188, fatG: 54 }),
  ).toEqual({ calories: 560, proteinG: 38, carbsG: 72, fatG: 16, status: 'under' });
  expect(
    calculateRemaining(target, { calories: 2400, proteinG: 170, carbsG: 260, fatG: 70 }),
  ).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, status: 'met' });
  expect(
    calculateRemaining(target, { calories: 2600, proteinG: 190, carbsG: 260, fatG: 70 }),
  ).toMatchObject({ calories: -200, proteinG: -20, status: 'over' });
});

test('estimates a calorie target from profile inputs using Mifflin-St Jeor', () => {
  const base = {
    sex: 'male' as const,
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'moderate' as const,
  };
  const maintain = estimateCalorieTarget({ ...base, goal: 'maintain_weight' });
  const lose = estimateCalorieTarget({ ...base, goal: 'lose_weight' });
  const gain = estimateCalorieTarget({ ...base, goal: 'gain_weight' });
  expect(maintain).toBeGreaterThan(0);
  expect(lose).toBe(maintain - 500);
  expect(gain).toBe(maintain + 300);
});

test('never estimates below the minimum safety floor regardless of inputs', () => {
  const target = estimateCalorieTarget({
    sex: 'female',
    ageYears: 70,
    heightCm: 150,
    weightKg: 45,
    activityLevel: 'sedentary',
    goal: 'lose_weight',
  });
  expect(target).toBeGreaterThanOrEqual(1200);
});

test.each([
  { ageYears: 0, heightCm: 180, weightKg: 80 },
  { ageYears: 30, heightCm: 0, weightKg: 80 },
  { ageYears: 30, heightCm: 180, weightKg: 0 },
  { ageYears: -1, heightCm: 180, weightKg: 80 },
])('rejects invalid profile inputs %j', inputs => {
  expect(() =>
    estimateCalorieTarget({
      sex: 'male',
      activityLevel: 'moderate',
      goal: 'maintain_weight',
      ...inputs,
    }),
  ).toThrow();
});

test('splits an estimated calorie target into a balanced starting macro mix', () => {
  expect(estimateMacroTargets(2000)).toEqual({
    proteinG: 150,
    carbsG: 200,
    fatG: 67,
  });
});
