import type { NormalizedFood } from './food.ts';

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

type UsdaNutrient = {
  nutrientId?: number;
  nutrientName?: string;
  value?: number;
};
type UsdaFood = {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients?: UsdaNutrient[];
};

// USDA's Branded-foods data is manufacturer-submitted and not curated —
// occasional entries carry a corrupted or per-package (instead of
// per-100g) value. `min`/`max` mirror the `foods` table's own check
// constraints, so a value that would fail the insert is dropped here
// instead of aborting the whole batch upsert (and the whole search) for
// every other, valid result in the same request.
function extractNutrient(
  nutrients: UsdaNutrient[],
  id: number,
  nameContains: string,
  min: number,
  max: number,
): number | null {
  const byId = nutrients.find(nutrient => nutrient.nutrientId === id);
  const raw =
    typeof byId?.value === 'number'
      ? byId.value
      : (() => {
          const byName = nutrients.find(
            nutrient =>
              typeof nutrient.nutrientName === 'string' &&
              nutrient.nutrientName.toLowerCase().includes(nameContains),
          );
          return typeof byName?.value === 'number' ? byName.value : null;
        })();
  return raw !== null && Number.isFinite(raw) && raw >= min && raw <= max
    ? raw
    : null;
}

// USDA's `foodNutrients` values in the search response are always
// normalized per 100 g / 100 mL, for every data type (Foundation, SR
// Legacy, and Branded alike) — so the basis stays 100 g and no serving size
// is invented from the food's labeled serving. See section 21/26 of the
// nutrition spec: "do not invent missing nutrition values."
export function normalizeUsdaFood(food: UsdaFood): NormalizedFood | null {
  const nutrients = food.foodNutrients ?? [];
  const calories = extractNutrient(nutrients, 1008, 'energy', 0, 5000);
  const proteinG = extractNutrient(nutrients, 1003, 'protein', 0, 1000);
  const carbsG = extractNutrient(nutrients, 1005, 'carbohydrate', 0, 1000);
  const fatG = extractNutrient(nutrients, 1004, 'total lipid', 0, 1000);
  // The "big 4" must all be present and within a sane range for a 100 g
  // basis; a food missing or failing that (a fabricated/mis-scaled outlier
  // is just as unusable as a missing value) is dropped rather than shown
  // with a fabricated or corrupted number.
  if (
    calories === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null
  ) {
    return null;
  }
  return {
    id: '', // filled in by the caller once the row is cached/upserted
    source: 'usda',
    sourceFoodId: String(food.fdcId),
    name: (food.description?.trim() || 'Unknown food').slice(0, 200),
    brand: food.brandOwner?.trim() || food.brandName?.trim() || null,
    barcode: null,
    servingSize: null,
    servingUnit: null,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG: extractNutrient(nutrients, 1079, 'fiber', 0, 1000),
    sugarG: extractNutrient(nutrients, 2000, 'sugars', 0, 1000),
    sodiumMg: extractNutrient(nutrients, 1093, 'sodium', 0, 100000),
  };
}

export class UsdaRateLimitError extends Error {}
export class UsdaProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function searchUsdaFoods(
  query: string,
  apiKey: string,
): Promise<NormalizedFood[]> {
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', '25');
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');
  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new UsdaProviderError('USDA request failed or timed out.');
  }
  if (response.status === 429) {
    throw new UsdaRateLimitError('USDA rate limit reached.');
  }
  if (!response.ok) {
    // Body text is USDA's own (small, non-sensitive) error payload — safe to
    // surface for debugging, e.g. "API_KEY_INVALID" for an unactivated key.
    const detail = await response.text().catch(() => '');
    throw new UsdaProviderError(
      `USDA responded with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.`,
      response.status,
    );
  }
  const body = (await response.json()) as { foods?: UsdaFood[] };
  return (body.foods ?? [])
    .map(normalizeUsdaFood)
    .filter((food): food is NormalizedFood => food !== null);
}
