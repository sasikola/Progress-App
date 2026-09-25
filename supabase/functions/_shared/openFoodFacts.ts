import type { NormalizedFood } from './food.ts';

const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
// Open Food Facts' API usage policy asks integrators to identify their app
// and provide a contact: https://openfoodfacts.github.io/openfoodfacts-server/api/
const USER_AGENT = 'ProgressNutritionApp/1.0 (Supabase Edge Function; no public contact configured)';

type OffNutriments = Record<string, unknown>;
type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  nutriments?: OffNutriments;
};

export class OpenFoodFactsProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

// Mirrors the USDA normalizer's approach: mis-scaled or corrupted
// manufacturer-submitted data is dropped rather than shown or allowed to
// fail the whole request. `min`/`max` mirror the `foods` table's own check
// constraints.
function sane(value: unknown, min: number, max: number): number | null {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : null;
  return num !== null && Number.isFinite(num) && num >= min && num <= max
    ? num
    : null;
}

// Open Food Facts reports every `*_100g` nutriment per 100 g/mL, like USDA's
// foodNutrients — so, as with the USDA provider, the basis stays 100 g and
// no serving size is invented from the product's free-text serving_size.
export function normalizeOffProduct(
  barcode: string,
  product: OffProduct,
): NormalizedFood | null {
  const n = product.nutriments ?? {};
  let calories = sane(n['energy-kcal_100g'], 0, 5000);
  if (calories === null) {
    // Some products only report energy in kJ; convert to kcal (1 kcal = 4.184 kJ).
    const kilojoules = sane(n.energy_100g, 0, 20000);
    calories = kilojoules === null ? null : Math.round((kilojoules / 4.184) * 10) / 10;
  }
  const proteinG = sane(n.proteins_100g, 0, 1000);
  const carbsG = sane(n.carbohydrates_100g, 0, 1000);
  const fatG = sane(n.fat_100g, 0, 1000);
  if (calories === null || proteinG === null || carbsG === null || fatG === null) {
    return null;
  }
  const name = (product.product_name || product.product_name_en || '').trim();
  if (!name) return null;
  // OFF reports sodium in grams per 100g; the app's model uses milligrams.
  const sodiumG = sane(n.sodium_100g, 0, 100);
  return {
    id: '',
    source: 'open_food_facts',
    sourceFoodId: barcode,
    name: name.slice(0, 200),
    brand: product.brands?.split(',')[0]?.trim() || null,
    barcode,
    servingSize: null,
    servingUnit: null,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG: sane(n.fiber_100g, 0, 1000),
    sugarG: sane(n.sugars_100g, 0, 1000),
    sodiumMg: sodiumG === null ? null : Math.round(sodiumG * 1000 * 10) / 10,
  };
}

// Returns null for "not found" (a normal outcome for an unrecognized
// barcode), and throws only for an actual provider/network failure.
export async function fetchOffProductByBarcode(
  barcode: string,
): Promise<NormalizedFood | null> {
  let response: Response;
  try {
    response = await fetch(`${OFF_PRODUCT_URL}/${encodeURIComponent(barcode)}.json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new OpenFoodFactsProviderError('Open Food Facts request failed or timed out.');
  }
  if (!response.ok) {
    throw new OpenFoodFactsProviderError(
      `Open Food Facts responded with ${response.status}.`,
      response.status,
    );
  }
  let body: { status?: number; product?: OffProduct };
  try {
    body = await response.json();
  } catch {
    // A 200 response with a non-JSON/unparseable body (e.g. a CDN or WAF
    // challenge page in front of Open Food Facts) is a provider failure,
    // not a "not found" — surface it distinctly instead of throwing an
    // unclassified error that falls back to a generic client message.
    throw new OpenFoodFactsProviderError(
      'Open Food Facts returned an unexpected (non-JSON) response.',
    );
  }
  if (body.status !== 1 || !body.product) return null;
  return normalizeOffProduct(barcode, body.product);
}
