import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NutritionScreen } from '../src/screens/nutrition/NutritionScreen';
import { TextInput } from '../src/components/inputs/TextInput';
import { Button } from '../src/components/buttons/Button';
import { nutritionService } from '../src/services/nutrition/nutritionService';
import type { Food } from '../src/services/nutrition/model';

jest.mock('../src/services/nutrition/nutritionService', () => ({
  nutritionService: {
    searchFoods: jest.fn(),
    getFood: jest.fn(),
    logEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    entriesForDate: jest.fn(),
    currentTarget: jest.fn(),
    setTarget: jest.fn(),
    getFoodByBarcode: jest.fn(),
    recentFoods: jest.fn(),
    favoriteFoods: jest.fn(),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
    myCustomFoods: jest.fn(),
    createCustomFood: jest.fn(),
  },
}));
jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (effect: () => void) => {
    require('react').useEffect(effect, [effect]);
  },
}));
jest.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

const service = jest.mocked(nutritionService);
let view: ReactTestRenderer.ReactTestRenderer;
let client: QueryClient;

const flush = async (ms = 20) => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, ms));
  });
};
const output = () =>
  JSON.stringify(view.toJSON(), (key, value) =>
    key === 'props' ? undefined : value,
  );
async function render() {
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <NutritionScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  await flush();
}
async function choose(label: string) {
  await act(async () => {
    view.root
      .findAllByProps({ accessibilityLabel: label })
      .find(item => typeof item.props.onPress === 'function')!
      .props.onPress();
  });
  await flush();
}
async function type(label: string, value: string) {
  await act(async () => {
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label === label)!
      .props.onChangeText(value);
  });
}
async function press(label: string) {
  await act(async () => {
    await view.root
      .findAllByType(Button)
      .find(item => item.props.label === label)!
      .props.onPress();
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  service.currentTarget.mockResolvedValue(null);
  service.entriesForDate.mockResolvedValue([]);
  service.recentFoods.mockResolvedValue([]);
  service.favoriteFoods.mockResolvedValue([]);
  service.myCustomFoods.mockResolvedValue([]);
});
const chickenFood: Food = {
  id: 'food-1',
  source: 'usda',
  sourceFoodId: 'fdc-171077',
  name: 'Chicken breast',
  brand: null,
  barcode: null,
  servingSize: null,
  servingUnit: null,
  calories: 165,
  proteinG: 31,
  carbsG: 0,
  fatG: 3.6,
  fiberG: null,
  sugarG: null,
  sodiumMg: 74,
};
const activeTarget = {
  id: 'target-1',
  calories: 2400,
  protein_g: 170,
  carbs_g: 260,
  fat_g: 70,
  effective_from: '2026-09-01',
};
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  client.clear();
});

test('shows the empty-target state and lets the user set a target', async () => {
  await render();
  expect(output()).toContain('Set your daily nutrition target');
  await choose('Set target');
  expect(output()).toContain('Daily nutrition target');

  service.setTarget.mockResolvedValue({
    id: 'target-1',
    calories: 2400,
    protein_g: 170,
    carbs_g: 260,
    fat_g: 70,
    effective_from: '2026-09-25',
  });
  await type('Calories (kcal)', '2400');
  await type('Protein (g)', '170');
  await type('Carbs (g)', '260');
  await type('Fat (g)', '70');
  await press('Save target');

  expect(service.setTarget).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({
      calories: 2400,
      proteinG: 170,
      carbsG: 260,
      fatG: 70,
    }),
  );
});

test('shows a migration setup message instead of an empty dashboard', async () => {
  service.currentTarget.mockRejectedValue({ code: 'PGRST205' });
  await render();
  expect(output()).toContain('Phase 9 SQL migration');
});

test('searches for a food and logs it to a meal end-to-end', async () => {
  service.currentTarget.mockResolvedValue({
    id: 'target-1',
    calories: 2400,
    protein_g: 170,
    carbs_g: 260,
    fat_g: 70,
    effective_from: '2026-09-01',
  });
  service.searchFoods.mockResolvedValue([
    {
      id: 'food-1',
      source: 'usda',
      sourceFoodId: 'fdc-171077',
      name: 'Chicken breast',
      brand: null,
      barcode: null,
      servingSize: null,
      servingUnit: null,
      calories: 165,
      proteinG: 31,
      carbsG: 0,
      fatG: 3.6,
      fiberG: null,
      sugarG: null,
      sodiumMg: 74,
    },
  ]);
  service.logEntry.mockResolvedValue({
    id: 'entry-1',
    food_id: 'food-1',
    meal_type: 'breakfast',
    consumed_at: '2026-09-25T08:00:00Z',
    local_date: '2026-09-25',
    quantity: 100,
    unit: 'g',
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: 74,
  });

  await render();
  await choose('Add food to breakfast');
  expect(output()).toContain('Search foods');

  await act(async () => {
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label === 'Search foods')!
      .props.onChangeText('chicken');
  });
  await flush(400); // clears the search debounce and resolves the query
  await flush();
  expect(service.searchFoods).toHaveBeenCalledWith('chicken', expect.anything());
  expect(output()).toContain('Chicken breast');

  await choose('Add Chicken breast');
  expect(output()).toContain('Add to meal');
  expect(output()).toContain('165');

  await press('Add to meal');
  expect(service.logEntry).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({
      foodId: 'food-1',
      mealType: 'breakfast',
      quantity: 100,
      unit: 'g',
      nutrition: expect.objectContaining({ calories: 165, proteinG: 31 }),
    }),
  );
  expect(output()).not.toContain('Add to meal');
});

test('deletes an existing entry only after the user confirms', async () => {
  service.currentTarget.mockResolvedValue({
    id: 'target-1',
    calories: 2400,
    protein_g: 170,
    carbs_g: 260,
    fat_g: 70,
    effective_from: '2026-09-01',
  });
  service.entriesForDate.mockResolvedValue([
    {
      id: 'entry-1',
      food_id: 'food-1',
      meal_type: 'breakfast',
      consumed_at: '2026-09-25T08:00:00Z',
      local_date: '2026-09-25',
      quantity: 3,
      unit: 'serving',
      calories: 216,
      protein_g: 18,
      carbs_g: 1.2,
      fat_g: 15,
      fiber_g: null,
      sugar_g: null,
      sodium_mg: 372,
      foods: { name: 'Eggs', brand: null },
    },
  ]);
  service.deleteEntry.mockResolvedValue(undefined);

  await render();
  expect(output()).toContain('Eggs');
  await choose('Delete Eggs entry');
  expect(service.deleteEntry).not.toHaveBeenCalled();
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => {
    buttons.find(button => button.style === 'destructive')!.onPress!();
  });
  await flush();
  expect(service.deleteEntry).toHaveBeenCalledWith('entry-1');
});

test('shows recent foods before searching, and a star toggles favorite status', async () => {
  service.currentTarget.mockResolvedValue(activeTarget);
  service.recentFoods.mockResolvedValue([chickenFood]);
  service.addFavorite.mockResolvedValue(undefined);

  await render();
  await choose('Add food to breakfast');
  expect(output()).toContain('Recent');
  expect(output()).toContain('Chicken breast');

  await choose('Add Chicken breast to favorites');
  expect(service.addFavorite).toHaveBeenCalledWith('user-1', 'food-1');
});

test('opens the camera scanner, finds a product, and logs it to a meal', async () => {
  service.currentTarget.mockResolvedValue(activeTarget);
  const appleSauce: Food = {
    id: 'food-2', source: 'open_food_facts', sourceFoodId: '3017620422003',
    name: 'Apple sauce', brand: null, barcode: '3017620422003', servingSize: null,
    servingUnit: null, calories: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2,
    fiberG: null, sugarG: null, sodiumMg: null,
  };
  service.getFoodByBarcode.mockResolvedValue(appleSauce);
  service.logEntry.mockResolvedValue({
    id: 'entry-2', food_id: 'food-2', meal_type: 'breakfast',
    consumed_at: '2026-09-25T08:00:00Z', local_date: '2026-09-25', quantity: 100,
    unit: 'g', calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2,
    fiber_g: null, sugar_g: null, sodium_mg: null,
  });

  await render();
  await choose('Add food to breakfast');
  await press('Scan barcode');
  await flush();
  expect(output()).toContain('Point your camera at a barcode.');

  const { Camera } = require('react-native-camera-kit');
  await act(async () => {
    view.root.findByType(Camera).props.onReadCode({
      nativeEvent: { codeStringValue: '3017620422003', codeFormat: 'ean-13' },
    });
  });
  await flush();
  expect(service.getFoodByBarcode).toHaveBeenCalledWith(
    '3017620422003',
    expect.anything(),
  );
  expect(output()).toContain('Apple sauce');

  await press('Add to meal');
  expect(service.logEntry).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ foodId: 'food-2', quantity: 100 }),
  );
});

test('looks up a barcode and adds the found product to a meal', async () => {
  service.currentTarget.mockResolvedValue(activeTarget);
  const appleSauce: Food = {
    id: 'food-2',
    source: 'open_food_facts',
    sourceFoodId: '3017620422003',
    name: 'Apple sauce',
    brand: null,
    barcode: '3017620422003',
    servingSize: null,
    servingUnit: null,
    calories: 52,
    proteinG: 0.3,
    carbsG: 14,
    fatG: 0.2,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
  };
  service.getFoodByBarcode.mockResolvedValue(appleSauce);
  service.logEntry.mockResolvedValue({
    id: 'entry-2',
    food_id: 'food-2',
    meal_type: 'breakfast',
    consumed_at: '2026-09-25T08:00:00Z',
    local_date: '2026-09-25',
    quantity: 100,
    unit: 'g',
    calories: 52,
    protein_g: 0.3,
    carbs_g: 14,
    fat_g: 0.2,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
  });

  await render();
  await choose('Add food to breakfast');
  await type('Barcode number', '3017620422003');
  await press('Look up barcode');
  expect(service.getFoodByBarcode).toHaveBeenCalledWith(
    '3017620422003',
    expect.anything(),
  );
  expect(output()).toContain('Apple sauce');

  await press('Add to meal');
  expect(service.logEntry).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ foodId: 'food-2', quantity: 100 }),
  );
});

test('reports a barcode with no matching product without treating it as an error', async () => {
  service.currentTarget.mockResolvedValue(activeTarget);
  service.getFoodByBarcode.mockResolvedValue(null);

  await render();
  await choose('Add food to breakfast');
  await type('Barcode number', '00000000');
  await press('Look up barcode');
  expect(output()).toContain('No product found for that barcode.');
});

// Regression test: `lookupNow` awaited `mutateAsync` with no try/catch, so a
// rejected lookup (function not deployed, provider failure, etc.) reported
// as an unhandled promise rejection in the console instead of just showing
// the error the UI already renders via lookupBarcode.isError. `press()`
// awaits the onPress handler itself, so if lookupNow's returned promise
// still rejected (the pre-fix behavior), this test would fail here with
// that rejection rather than reaching the assertions below.
test('a failed barcode lookup resolves cleanly and shows the error', async () => {
  service.currentTarget.mockResolvedValue(activeTarget);
  service.getFoodByBarcode.mockRejectedValue(
    new Error('get-food-by-barcode was not found. Confirm it’s deployed.'),
  );

  await render();
  await choose('Add food to breakfast');
  await type('Barcode number', '00000000');
  await press('Look up barcode');

  expect(output()).toContain('not found');
});

test('creates a custom food and flows straight into logging it', async () => {
  service.currentTarget.mockResolvedValue(activeTarget);
  const dal: Food = {
    id: 'food-3',
    source: 'custom',
    sourceFoodId: null,
    name: 'Grandma’s dal',
    brand: null,
    barcode: null,
    servingSize: null,
    servingUnit: null,
    calories: 180,
    proteinG: 9,
    carbsG: 22,
    fatG: 6,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
  };
  service.createCustomFood.mockResolvedValue(dal);

  await render();
  await choose('Add food to breakfast');
  await press('Create a custom food');
  expect(output()).toContain('Create a custom food');

  await type('Name', 'Grandma’s dal');
  await type('Calories (kcal, per 100 g)', '180');
  await type('Protein (g, per 100 g)', '9');
  await type('Carbs (g, per 100 g)', '22');
  await type('Fat (g, per 100 g)', '6');
  await press('Create food');

  expect(service.createCustomFood).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ name: 'Grandma’s dal', calories: 180 }),
  );
  expect(output()).toContain('Add to meal');
});
