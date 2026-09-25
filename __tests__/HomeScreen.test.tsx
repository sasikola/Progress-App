import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../src/screens/home/HomeScreen';
import { Button } from '../src/components/buttons/Button';
import { Screen } from '../src/components/common/Screen';
import type { MainTabParamList } from '../src/navigation/types';

let mockHome: Record<string, any>;
let mockNutrition: Record<string, any>;
const mockRefreshProfile = jest.fn().mockResolvedValue({});
jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.mock('../src/services/profile/useProfile', () => ({
  useProfile: () => ({
    data: { name: 'Alex', goal: 'build_muscle' },
    refetch: mockRefreshProfile,
  }),
}));
jest.mock('../src/services/home/useHome', () => ({ useHome: () => mockHome }));
jest.mock('../src/services/nutrition/useNutrition', () => ({
  useDailyNutrition: () => mockNutrition,
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
let view: ReactTestRenderer.ReactTestRenderer;
const navigate = jest.fn();
async function render() {
  const props = { navigation: { navigate } } as unknown as BottomTabScreenProps<
    MainTabParamList,
    'Home'
  >;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <HomeScreen {...props} />
      </SafeAreaProvider>,
    );
  });
}
// RefreshControl is a React element in ScrollView props; assert rendered text
// without serializing React's internal/context references.
const output = () =>
  JSON.stringify(view.toJSON(), (key, value) =>
    key === 'props' ? undefined : value,
  );
beforeEach(() => {
  jest.clearAllMocks();
  mockHome = {
    weights: { data: [], refetch: jest.fn().mockResolvedValue({}) },
    recentWorkout: {
      data: { available: true, workout: null },
      refetch: jest.fn().mockResolvedValue({}),
    },
  };
  mockNutrition = {
    entries: { data: [], refetch: jest.fn().mockResolvedValue({}) },
    target: { data: null, refetch: jest.fn().mockResolvedValue({}) },
  };
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
});
test('greets by name, shows goal/empty states, and opens Workout', async () => {
  await render();
  expect(output()).toContain('Hi, Alex.');
  expect(output()).toContain('Build muscle');
  expect(output()).toContain('No weight recorded');
  expect(output()).toContain('No completed workouts yet');
  expect(output()).toContain('No nutrition target set');
  await act(async () => {
    view.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Start Workout')!
      .props.onPress();
  });
  expect(navigate).toHaveBeenCalledWith('Workout', { start: true });
});
test('shows real weight change and completed workout duration', async () => {
  mockHome.weights.data = [
    { weight: 70, unit: 'kg', recorded_at: '2026-09-23T00:00:00Z' },
    { weight: 72, unit: 'kg', recorded_at: '2026-09-20T00:00:00Z' },
  ];
  mockHome.recentWorkout.data.workout = {
    completed_at: '2026-09-23T00:00:00Z',
    duration_seconds: 1800,
  };
  await render();
  expect(output()).toContain('-2.0 kg since your previous entry');
  expect(output()).toContain('30 min of training');
  expect(output()).not.toContain('No weight recorded');
});
test('loading and error states are not presented as empty records', async () => {
  mockHome.weights.isLoading = true;
  mockHome.recentWorkout.isError = true;
  await render();
  expect(output()).toContain('Loading weight');
  expect(output()).toContain('Retry workouts');
  expect(output()).not.toContain('No completed workouts yet');
});
test('refreshes on focus and pull-to-refresh; missing workout schema is explicit', async () => {
  mockHome.recentWorkout.data.available = false;
  await render();
  expect(output()).toContain('Workout database setup needed');
  expect(mockHome.weights.refetch).toHaveBeenCalledTimes(1);
  expect(mockNutrition.entries.refetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    await view.root.findByType(Screen).props.onRefresh();
  });
  expect(mockHome.weights.refetch).toHaveBeenCalledTimes(2);
  expect(mockHome.recentWorkout.refetch).toHaveBeenCalledTimes(2);
  expect(mockNutrition.entries.refetch).toHaveBeenCalledTimes(2);
  expect(mockNutrition.target.refetch).toHaveBeenCalledTimes(2);
  expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
});
test('shows today’s nutrition against target, and a distinct setup-needed state', async () => {
  mockNutrition.target.data = {
    calories: 2400,
    protein_g: 170,
    carbs_g: 260,
    fat_g: 70,
    effective_from: '2026-09-01',
  };
  mockNutrition.entries.data = [
    {
      id: 'entry-1',
      calories: 620,
      protein_g: 40,
      carbs_g: 60,
      fat_g: 20,
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
    },
  ];
  await render();
  // AppText splits `{a} / {b} kcal` into separate JSON string children, so
  // assert on the distinct numeric tokens rather than one joined substring.
  expect(output()).toContain('"620"');
  expect(output()).toContain('"2400"');
  expect(output()).toContain('"40"');
  expect(output()).toContain('"170"');

  mockNutrition.entries.error = { code: 'PGRST205' };
  mockNutrition.entries.data = undefined;
  await render();
  expect(output()).toContain('Nutrition setup needed');
  expect(output()).not.toContain('couldn’t load today’s nutrition');
});
