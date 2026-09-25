import {
  fetchOffProductByBarcode,
  normalizeOffProduct,
  OpenFoodFactsProviderError,
} from '../supabase/functions/_shared/openFoodFacts';

const withoutCalories = {
  proteins_100g: 0.3,
  carbohydrates_100g: 14,
  fat_100g: 0.2,
};
const bigFour = { 'energy-kcal_100g': 52, ...withoutCalories };

test('normalizes a valid Open Food Facts product into the app’s Food shape', () => {
  const normalized = normalizeOffProduct('3017620422003', {
    product_name: 'Apple sauce',
    brands: 'Acme, Acme Kids',
    nutriments: bigFour,
  });
  expect(normalized).toMatchObject({
    source: 'open_food_facts',
    sourceFoodId: '3017620422003',
    barcode: '3017620422003',
    name: 'Apple sauce',
    brand: 'Acme',
    calories: 52,
    proteinG: 0.3,
    carbsG: 14,
    fatG: 0.2,
  });
});

test('drops a product missing any of the "big 4" nutrients rather than fabricating zero', () => {
  expect(
    normalizeOffProduct('123', { product_name: 'Test', nutriments: withoutCalories }),
  ).toBeNull();
  expect(normalizeOffProduct('123', { product_name: 'No nutriments' })).toBeNull();
});

test('drops a product whose big-4 value is outside the sane range instead of throwing', () => {
  expect(
    normalizeOffProduct('123', {
      product_name: 'Corrupted',
      nutriments: { ...bigFour, proteins_100g: 45000 },
    }),
  ).toBeNull();
  expect(
    normalizeOffProduct('123', {
      product_name: 'Negative fat',
      nutriments: { ...bigFour, fat_100g: -1 },
    }),
  ).toBeNull();
});

test('falls back to kJ-to-kcal conversion when energy-kcal_100g is absent', () => {
  const normalized = normalizeOffProduct('123', {
    product_name: 'Reports kJ only',
    nutriments: { ...withoutCalories, energy_100g: 217.6 }, // 217.6 kJ ~= 52 kcal
  });
  expect(normalized?.calories).toBeCloseTo(52, 0);
});

test('converts sodium from grams (Open Food Facts) to milligrams (the app’s unit)', () => {
  const normalized = normalizeOffProduct('123', {
    product_name: 'Salty snack',
    nutriments: { ...bigFour, sodium_100g: 1.2 },
  });
  expect(normalized?.sodiumMg).toBeCloseTo(1200, 0);
});

test('drops a product with a blank name rather than inventing a placeholder', () => {
  expect(
    normalizeOffProduct('123', { product_name: '   ', nutriments: bigFour }),
  ).toBeNull();
});

test('falls back to the English name when the primary name is blank', () => {
  const normalized = normalizeOffProduct('123', {
    product_name: '',
    product_name_en: 'English name',
    nutriments: bigFour,
  });
  expect(normalized?.name).toBe('English name');
});

test('truncates an unreasonably long product name instead of rejecting the product', () => {
  const normalized = normalizeOffProduct('123', {
    product_name: 'A'.repeat(500),
    nutriments: bigFour,
  });
  expect(normalized?.name.length).toBe(200);
});

test('has no brand when the product lists none', () => {
  const normalized = normalizeOffProduct('123', {
    product_name: 'Unbranded item',
    nutriments: bigFour,
  });
  expect(normalized?.brand).toBeNull();
});

// Regression test: a 200 response with a non-JSON body (e.g. a CDN/WAF
// challenge page in front of Open Food Facts) previously threw an
// unclassified SyntaxError from response.json(), which the calling Edge
// Function couldn't distinguish from "ran and failed for an unknown
// reason" — it must surface as a provider failure instead.
test('fetchOffProductByBarcode treats a non-JSON 200 response as a provider error, not a crash', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    await expect(fetchOffProductByBarcode('123')).rejects.toBeInstanceOf(
      OpenFoodFactsProviderError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
