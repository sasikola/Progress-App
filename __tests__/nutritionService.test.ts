import { supabase } from '../src/lib/supabase';
import { nutritionService } from '../src/services/nutrition/nutritionService';

jest.mock('../src/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), functions: { invoke: jest.fn() } },
}));

const signal = new AbortController().signal;

function builder(result: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const self = new Proxy(
    { then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject) },
    {
      get(target, prop: string) {
        if (prop in target) return (target as never)[prop];
        chain[prop] ??= jest.fn(() => self);
        return chain[prop];
      },
    },
  ) as unknown as Record<string, jest.Mock> & PromiseLike<unknown>;
  return { self, chain };
}

const foodRow = {
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
};
const entryRow = {
  id: 'entry-1',
  food_id: 'food-1',
  meal_type: 'lunch',
  consumed_at: '2026-09-25T12:30:00Z',
  local_date: '2026-09-25',
  quantity: 200,
  unit: 'g',
  calories: 330,
  protein_g: 62,
  carbs_g: 0,
  fat_g: 7.2,
  fiber_g: null,
  sugar_g: null,
  sodium_mg: 148,
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('short queries never reach the network', async () => {
  expect(await nutritionService.searchFoods(' a ', signal)).toEqual([]);
  expect(supabase!.functions.invoke).not.toHaveBeenCalled();
});

test('search trims the query, forwards the abort signal and normalizes results', async () => {
  jest.mocked(supabase!.functions.invoke).mockResolvedValue({
    data: {
      foods: [
        {
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
        },
      ],
    },
    error: null,
  } as never);
  const results = await nutritionService.searchFoods('  chicken breast  ', signal);
  expect(results).toHaveLength(1);
  expect(results[0].name).toBe('Chicken breast');
  expect(supabase!.functions.invoke).toHaveBeenCalledWith('search-foods', {
    body: { query: 'chicken breast' },
    signal,
  });
});

test('search unwraps the Edge Function’s own JSON error message', async () => {
  const httpError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: { json: () => Promise.resolve({ error: 'Too many searches right now. Try again shortly.' }) },
  });
  jest.mocked(supabase!.functions.invoke).mockResolvedValue({ data: null, error: httpError } as never);
  await expect(nutritionService.searchFoods('chicken', signal)).rejects.toThrow(
    'Too many searches right now. Try again shortly.',
  );
});

test('search reports an unreachable function distinctly from a rejected request', async () => {
  const relayError = Object.assign(new Error('Relay Error invoking the Edge Function'), {
    name: 'FunctionsRelayError',
    context: {},
  });
  jest.mocked(supabase!.functions.invoke).mockResolvedValue({ data: null, error: relayError } as never);
  await expect(nutritionService.searchFoods('chicken', signal)).rejects.toThrow(
    /Edge Function is deployed/,
  );
});

test('getFood reads the cached row by ID and normalizes it', async () => {
  const { self, chain } = builder({ data: foodRow, error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  const food = await nutritionService.getFood('food-1', signal);
  expect(supabase!.from).toHaveBeenCalledWith('foods');
  expect(chain.eq).toHaveBeenCalledWith('id', 'food-1');
  expect(chain.abortSignal).toHaveBeenCalledWith(signal);
  expect(food.proteinG).toBe(31);
});

test('logEntry sends a snapshot payload through the idempotent RPC', async () => {
  jest.mocked(supabase!.rpc).mockResolvedValue({ data: entryRow, error: null } as never);
  const entry = await nutritionService.logEntry('user-1', {
    clientId: 'lunch-1',
    foodId: 'food-1',
    mealType: 'lunch',
    consumedAt: '2026-09-25T12:30:00Z',
    localDate: '2026-09-25',
    quantity: 200,
    unit: 'g',
    nutrition: { calories: 330, proteinG: 62, carbsG: 0, fatG: 7.2, fiberG: null, sugarG: null, sodiumMg: 148 },
  });
  expect(supabase!.rpc).toHaveBeenCalledWith('log_food_entry', {
    p_user_id: 'user-1',
    p_client_id: 'lunch-1',
    p_food_id: 'food-1',
    p_meal_type: 'lunch',
    p_consumed_at: '2026-09-25T12:30:00Z',
    p_local_date: '2026-09-25',
    p_quantity: 200,
    p_unit: 'g',
    p_calories: 330,
    p_protein_g: 62,
    p_carbs_g: 0,
    p_fat_g: 7.2,
    p_fiber_g: null,
    p_sugar_g: null,
    p_sodium_mg: 148,
  });
  expect(entry.id).toBe('entry-1');
});

test('updateEntry persists the recalculated snapshot for an existing entry', async () => {
  const { self, chain } = builder({ data: { ...entryRow, quantity: 250, calories: 412.5 }, error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  const updated = await nutritionService.updateEntry('entry-1', 250, 'g', {
    calories: 412.5, proteinG: 77.5, carbsG: 0, fatG: 9, fiberG: null, sugarG: null, sodiumMg: 185,
  });
  expect(chain.update).toHaveBeenCalledWith(
    expect.objectContaining({ quantity: 250, unit: 'g', calories: 412.5 }),
  );
  expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
  expect(updated.quantity).toBe(250);
});

test('deleteEntry issues a scoped delete and surfaces failures', async () => {
  const { self } = builder({ error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  await expect(nutritionService.deleteEntry('entry-1')).resolves.toBeUndefined();
  const failing = builder({ error: { code: '42501' } });
  jest.mocked(supabase!.from).mockReturnValue(failing.self as never);
  await expect(nutritionService.deleteEntry('entry-1')).rejects.toEqual({ code: '42501' });
});

test('entriesForDate scopes by user and local date, joined with the food name', async () => {
  const { self, chain } = builder({ data: [entryRow], error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  const entries = await nutritionService.entriesForDate('user-1', '2026-09-25', signal);
  expect(chain.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
  expect(chain.eq).toHaveBeenNthCalledWith(2, 'local_date', '2026-09-25');
  expect(entries).toHaveLength(1);
});

test('currentTarget resolves the most recent target on or before the date, or null', async () => {
  const { self, chain } = builder({
    data: [{ id: 't1', calories: 2400, protein_g: 170, carbs_g: 260, fat_g: 70, effective_from: '2026-09-01' }],
    error: null,
  });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  const target = await nutritionService.currentTarget('user-1', '2026-09-20', signal);
  expect(chain.lte).toHaveBeenCalledWith('effective_from', '2026-09-20');
  expect(chain.order).toHaveBeenCalledWith('effective_from', { ascending: false });
  expect(chain.limit).toHaveBeenCalledWith(1);
  expect(target?.calories).toBe(2400);
  const empty = builder({ data: [], error: null });
  jest.mocked(supabase!.from).mockReturnValue(empty.self as never);
  expect(await nutritionService.currentTarget('user-1', '2026-01-01', signal)).toBeNull();
});

test('setTarget sends a stable request ID through the idempotent RPC', async () => {
  jest.mocked(supabase!.rpc).mockResolvedValue({
    data: { id: 't1', calories: 2400, protein_g: 170, carbs_g: 260, fat_g: 70, effective_from: '2026-09-01' },
    error: null,
  } as never);
  await nutritionService.setTarget('user-1', {
    clientId: 'target-sept',
    calories: 2400,
    proteinG: 170,
    carbsG: 260,
    fatG: 70,
    effectiveFrom: '2026-09-01',
  });
  expect(supabase!.rpc).toHaveBeenCalledWith('set_nutrition_target', {
    p_user_id: 'user-1',
    p_client_id: 'target-sept',
    p_calories: 2400,
    p_protein_g: 170,
    p_carbs_g: 260,
    p_fat_g: 70,
    p_effective_from: '2026-09-01',
  });
});

test('getFoodByBarcode normalizes a found product and returns null for not-found', async () => {
  jest.mocked(supabase!.functions.invoke).mockResolvedValueOnce({
    data: {
      food: {
        id: 'food-2', source: 'open_food_facts', sourceFoodId: '123', name: 'Apple sauce',
        brand: null, barcode: '123', servingSize: null, servingUnit: null,
        calories: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2, fiberG: null, sugarG: null, sodiumMg: null,
      },
    },
    error: null,
  } as never);
  const food = await nutritionService.getFoodByBarcode('123', signal);
  expect(supabase!.functions.invoke).toHaveBeenCalledWith('get-food-by-barcode', {
    body: { barcode: '123' },
    signal,
  });
  expect(food?.name).toBe('Apple sauce');

  jest.mocked(supabase!.functions.invoke).mockResolvedValueOnce({ data: { food: null }, error: null } as never);
  expect(await nutritionService.getFoodByBarcode('000', signal)).toBeNull();
});

test('recentFoods calls the RPC with a bounded limit and normalizes rows', async () => {
  jest.mocked(supabase!.rpc).mockReturnValue({
    abortSignal: jest.fn().mockResolvedValue({ data: [foodRow], error: null }),
  } as never);
  const foods = await nutritionService.recentFoods(signal);
  expect(supabase!.rpc).toHaveBeenCalledWith('recent_foods', { p_limit: 10 });
  expect(foods[0].name).toBe('Chicken breast');
});

test('favoriteFoods unwraps the joined foods row, ordered newest-favorited-first', async () => {
  const { self, chain } = builder({ data: [{ food_id: 'food-1', foods: foodRow }], error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  const foods = await nutritionService.favoriteFoods('user-1', signal);
  expect(supabase!.from).toHaveBeenCalledWith('favorite_foods');
  expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  expect(foods[0].name).toBe('Chicken breast');
});

test('addFavorite upserts with ignoreDuplicates so a retry cannot fail on the unique constraint', async () => {
  const { self, chain } = builder({ error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  await nutritionService.addFavorite('user-1', 'food-1');
  expect(chain.upsert).toHaveBeenCalledWith(
    { user_id: 'user-1', food_id: 'food-1' },
    { onConflict: 'user_id,food_id', ignoreDuplicates: true },
  );
});

test('removeFavorite scopes the delete to the owner and the specific food', async () => {
  const { self, chain } = builder({ error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  await nutritionService.removeFavorite('user-1', 'food-1');
  expect(chain.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
  expect(chain.eq).toHaveBeenNthCalledWith(2, 'food_id', 'food-1');
});

test('myCustomFoods scopes to the caller’s own custom-source rows', async () => {
  const { self, chain } = builder({ data: [foodRow], error: null });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  await nutritionService.myCustomFoods('user-1', signal);
  expect(chain.eq).toHaveBeenNthCalledWith(1, 'source', 'custom');
  expect(chain.eq).toHaveBeenNthCalledWith(2, 'created_by', 'user-1');
});

test('createCustomFood inserts a caller-owned custom food and normalizes the result', async () => {
  const { self, chain } = builder({
    data: { ...foodRow, id: 'food-3', source: 'custom', source_food_id: null, name: 'Grandma’s dal' },
    error: null,
  });
  jest.mocked(supabase!.from).mockReturnValue(self as never);
  const food = await nutritionService.createCustomFood('user-1', {
    name: 'Grandma’s dal', brand: null, calories: 180, proteinG: 9, carbsG: 22, fatG: 6,
    fiberG: null, sugarG: null, sodiumMg: null,
  });
  expect(chain.insert).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'custom', created_by: 'user-1', name: 'Grandma’s dal' }),
  );
  expect(food.name).toBe('Grandma’s dal');
});

// Regression test: a missing Edge Function is itself a normal (non-2xx)
// HTTP response — a FunctionsHttpError, not a FunctionsRelayError — so it
// was falling into the generic fallback message with no way to tell "not
// deployed" apart from "ran and failed". A 404 must say so distinctly.
test('getFoodByBarcode reports a 404 as a not-deployed function, not a generic failure', async () => {
  const httpError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: { status: 404, json: () => Promise.reject(new Error('not json')) },
  });
  jest.mocked(supabase!.functions.invoke).mockResolvedValueOnce({ data: null, error: httpError } as never);
  await expect(nutritionService.getFoodByBarcode('123', signal)).rejects.toThrow(
    /get-food-by-barcode was not found.*supabase functions deploy get-food-by-barcode/,
  );
});

test('getFoodByBarcode includes the HTTP status when the function returns a non-JSON error body', async () => {
  const httpError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: { status: 502, json: () => Promise.reject(new Error('not json')) },
  });
  jest.mocked(supabase!.functions.invoke).mockResolvedValueOnce({ data: null, error: httpError } as never);
  await expect(nutritionService.getFoodByBarcode('123', signal)).rejects.toThrow(/responded with 502/);
});
