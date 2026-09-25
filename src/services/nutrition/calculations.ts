export type NutritionValues = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// A single rounding pass at the end of the scale/sum, never on intermediates.
function scale(basis: NutritionValues, factor: number): NutritionValues {
  return {
    calories: round(basis.calories * factor, 0),
    proteinG: round(basis.proteinG * factor, 1),
    carbsG: round(basis.carbsG * factor, 1),
    fatG: round(basis.fatG * factor, 1),
    fiberG: basis.fiberG === null ? null : round(basis.fiberG * factor, 1),
    sugarG: basis.sugarG === null ? null : round(basis.sugarG * factor, 1),
    sodiumMg:
      basis.sodiumMg === null ? null : round(basis.sodiumMg * factor, 0),
  };
}

export function calculateNutritionForQuantity(
  per100g: NutritionValues,
  quantityGrams: number,
): NutritionValues {
  if (!(quantityGrams > 0)) {
    throw new Error('Quantity must be greater than 0.');
  }
  return scale(per100g, quantityGrams / 100);
}

export function calculateNutritionForServing(
  perServing: NutritionValues,
  servings: number,
): NutritionValues {
  if (!(servings > 0)) {
    throw new Error('Servings must be greater than 0.');
  }
  return scale(perServing, servings);
}

export function calculateDailyNutrition(
  entries: readonly NutritionValues[],
): NutritionValues {
  const total = entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      proteinG: acc.proteinG + entry.proteinG,
      carbsG: acc.carbsG + entry.carbsG,
      fatG: acc.fatG + entry.fatG,
      fiberG:
        entry.fiberG === null ? acc.fiberG : (acc.fiberG ?? 0) + entry.fiberG,
      sugarG:
        entry.sugarG === null ? acc.sugarG : (acc.sugarG ?? 0) + entry.sugarG,
      sodiumMg:
        entry.sodiumMg === null
          ? acc.sodiumMg
          : (acc.sodiumMg ?? 0) + entry.sodiumMg,
    }),
    {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: null as number | null,
      sugarG: null as number | null,
      sodiumMg: null as number | null,
    },
  );
  return {
    calories: round(total.calories, 0),
    proteinG: round(total.proteinG, 1),
    carbsG: round(total.carbsG, 1),
    fatG: round(total.fatG, 1),
    fiberG: total.fiberG === null ? null : round(total.fiberG, 1),
    sugarG: total.sugarG === null ? null : round(total.sugarG, 1),
    sodiumMg: total.sodiumMg === null ? null : round(total.sodiumMg, 0),
  };
}

export type MacroTarget = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type RemainingStatus = 'under' | 'met' | 'over';
export type Remaining = MacroTarget & { status: RemainingStatus };

export function calculateRemaining(
  target: MacroTarget,
  consumed: MacroTarget,
): Remaining {
  const calories = round(target.calories - consumed.calories, 0);
  return {
    calories,
    proteinG: round(target.proteinG - consumed.proteinG, 1),
    carbsG: round(target.carbsG - consumed.carbsG, 1),
    fatG: round(target.fatG - consumed.fatG, 1),
    status: calories > 0 ? 'under' : calories === 0 ? 'met' : 'over',
  };
}

export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';
export type NutritionGoal = 'lose_weight' | 'maintain_weight' | 'gain_weight';

export const activityLevelOptions = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little to no exercise' },
  { value: 'light', label: 'Lightly active', description: '1–3 workouts a week' },
  { value: 'moderate', label: 'Moderately active', description: '3–5 workouts a week' },
  { value: 'active', label: 'Active', description: '6–7 workouts a week' },
  { value: 'very_active', label: 'Very active', description: 'Physical job or 2x/day training' },
] as const satisfies readonly { value: ActivityLevel; label: string; description: string }[];

export const nutritionGoalOptions = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'maintain_weight', label: 'Maintain weight' },
  { value: 'gain_weight', label: 'Gain weight' },
] as const satisfies readonly { value: NutritionGoal; label: string }[];

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const goalAdjustment: Record<NutritionGoal, number> = {
  lose_weight: -500,
  maintain_weight: 0,
  gain_weight: 300,
};
// A conservative floor: never suggest below what's broadly considered
// unsafe for sustained intake, regardless of the computed deficit.
const minimumCalorieFloor = 1200;

// Mifflin-St Jeor: a documented, widely used estimate — not a medical
// measurement. Callers must present it as an editable starting point.
export function estimateCalorieTarget(input: {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: NutritionGoal;
}): number {
  if (
    !(input.ageYears > 0 && input.ageYears < 120) ||
    !(input.heightCm > 0 && input.heightCm < 300) ||
    !(input.weightKg > 0 && input.weightKg < 500)
  ) {
    throw new Error('Enter a valid age, height and weight.');
  }
  const bmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.ageYears +
    (input.sex === 'male' ? 5 : -161);
  const maintenance = bmr * activityMultipliers[input.activityLevel];
  const adjusted = maintenance + goalAdjustment[input.goal];
  return Math.max(minimumCalorieFloor, round(adjusted, 0));
}

// A common balanced split (30% protein / 40% carbs / 30% fat) used only as a
// starting point; the user can edit every value afterward.
export function estimateMacroTargets(calories: number): {
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  if (!(calories > 0)) throw new Error('Calories must be greater than 0.');
  return {
    proteinG: round((calories * 0.3) / 4, 0),
    carbsG: round((calories * 0.4) / 4, 0),
    fatG: round((calories * 0.3) / 9, 0),
  };
}
