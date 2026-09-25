import { normalizeUsdaFood } from '../supabase/functions/_shared/usda';

function food(nutrients: { nutrientId?: number; nutrientName?: string; value?: number }[]) {
  return { fdcId: 12345, description: 'Test food', foodNutrients: nutrients };
}
const bigFour = [
  { nutrientId: 1008, nutrientName: 'Energy', value: 165 },
  { nutrientId: 1003, nutrientName: 'Protein', value: 31 },
  { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', value: 0 },
  { nutrientId: 1004, nutrientName: 'Total lipid (fat)', value: 3.6 },
];

test('normalizes a valid USDA response into the app’s Food shape', () => {
  const normalized = normalizeUsdaFood(food(bigFour));
  expect(normalized).toMatchObject({
    source: 'usda',
    sourceFoodId: '12345',
    name: 'Test food',
    calories: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
  });
});

test('drops a food missing any of the "big 4" nutrients rather than fabricating zero', () => {
  expect(
    normalizeUsdaFood(food(bigFour.filter(n => n.nutrientId !== 1003))),
  ).toBeNull();
  expect(normalizeUsdaFood({ fdcId: 1, description: 'Empty' })).toBeNull();
});

// Regression test for a real production bug: a USDA Branded-food record
// returned a carbs_g value the `foods` table's check constraint rejects
// (out of the 0-1000 sane range for a 100 g basis), which aborted the
// entire batch upsert — and therefore the whole search — for every other
// valid result in the same request. The fix drops just the bad record.
test('drops a food whose big-4 value is outside the sane range instead of failing the whole batch', () => {
  const corruptCarbs = bigFour.map(n =>
    n.nutrientId === 1005 ? { ...n, value: 45000 } : n,
  );
  expect(normalizeUsdaFood(food(corruptCarbs))).toBeNull();

  const negativeProtein = bigFour.map(n =>
    n.nutrientId === 1003 ? { ...n, value: -5 } : n,
  );
  expect(normalizeUsdaFood(food(negativeProtein))).toBeNull();

  const nonFiniteCalories = bigFour.map(n =>
    n.nutrientId === 1008 ? { ...n, value: Number.NaN } : n,
  );
  expect(normalizeUsdaFood(food(nonFiniteCalories))).toBeNull();
});

test('keeps the food but drops an individual optional nutrient that is out of range', () => {
  const normalized = normalizeUsdaFood(
    food([...bigFour, { nutrientId: 1093, nutrientName: 'Sodium, Na', value: 999999 }]),
  );
  expect(normalized).not.toBeNull();
  expect(normalized?.sodiumMg).toBeNull();
});

test('prefers matching by nutrientId over a name-based fallback', () => {
  const normalized = normalizeUsdaFood(
    food([
      ...bigFour,
      { nutrientName: 'Some unrelated protein-adjacent additive', value: 500 },
    ]),
  );
  expect(normalized?.proteinG).toBe(31);
});

test('falls back to a name match only when no nutrientId matches', () => {
  const byNameOnly = bigFour.map(n =>
    n.nutrientId === 1003 ? { nutrientName: 'Protein', value: 20 } : n,
  );
  expect(normalizeUsdaFood(food(byNameOnly))?.proteinG).toBe(20);
});

test('truncates an unreasonably long description instead of rejecting the food', () => {
  const longName = 'A'.repeat(500);
  const normalized = normalizeUsdaFood({
    fdcId: 1,
    description: longName,
    foodNutrients: bigFour,
  });
  expect(normalized?.name.length).toBe(200);
});

test('falls back to a placeholder name when the description is blank', () => {
  const normalized = normalizeUsdaFood({
    fdcId: 1,
    description: '   ',
    foodNutrients: bigFour,
  });
  expect(normalized?.name).toBe('Unknown food');
});
