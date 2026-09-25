import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { WorkoutScreen } from '../src/screens/workout/WorkoutScreen';
import { Button } from '../src/components/buttons/Button';
import { TextInput } from '../src/components/inputs/TextInput';
import { workoutService } from '../src/services/workout/workoutService';
import { draftStorage } from '../src/services/workout/draftStorage';
import type {
  WorkoutDraft,
  WorkoutDetail,
} from '../src/services/workout/model';
import type { MainTabParamList } from '../src/navigation/types';

jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.mock('../src/services/profile/useProfile', () => ({
  useProfile: () => ({ data: { weight_unit: 'kg' } }),
}));
jest.mock('../src/services/workout/draftStorage', () => ({
  draftStorage: { read: jest.fn(), write: jest.fn(), remove: jest.fn() },
}));
jest.mock('../src/services/workout/workoutService', () => ({
  ...jest.requireActual('../src/services/workout/workoutService'),
  workoutService: {
    catalog: jest.fn(),
    previous: jest.fn(),
    finish: jest.fn(),
    detail: jest.fn(),
    history: jest.fn(),
  },
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
const exercise = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Squat',
  category: 'Legs',
  description: 'Total barbell load',
};
const workout: WorkoutDetail = {
  id: 'workout-1',
  started_at: '2026-01-01T10:00:00Z',
  completed_at: '2026-01-01T10:30:00Z',
  duration_seconds: 1800,
  exercise_count: 1,
  set_count: 1,
  volume_kg: 600,
  records: [],
  workout_exercises: [
    {
      id: 'exercise-row',
      order_index: 0,
      exercises: exercise,
      workout_sets: [
        {
          id: 'set-row',
          set_number: 1,
          weight: 60,
          weight_unit: 'kg',
          reps: 10,
          completed: true,
        },
      ],
    },
  ],
};
let saved: WorkoutDraft | null;
let view: ReactTestRenderer.ReactTestRenderer | undefined;
let client: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  });
}
const button = (label: string) =>
  view!.root.findAllByType(Button).find(item => item.props.label === label)!;
const field = (label: string) =>
  view!.root.findAllByType(TextInput).find(item => item.props.label === label)!;
async function press(label: string) {
  await act(async () => {
    await button(label).props.onPress();
  });
  await flush();
}
const output = () =>
  JSON.stringify(view!.toJSON(), (key, value) =>
    key === 'props' ? undefined : value,
  );
async function mount() {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const props = {
    navigation: { navigate: jest.fn(), setParams: jest.fn() },
    route: { name: 'Workout', key: 'Workout' },
  } as unknown as BottomTabScreenProps<MainTabParamList, 'Workout'>;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <WorkoutScreen {...props} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  await flush();
}
async function unmount() {
  if (view) await act(async () => view!.unmount());
  view = undefined;
  client?.clear();
}
beforeEach(() => {
  jest.clearAllMocks();
  saved = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(draftStorage.read).mockImplementation(async () => saved);
  jest.mocked(draftStorage.write).mockImplementation(async (_user, draft) => {
    saved = JSON.parse(JSON.stringify(draft));
  });
  jest.mocked(draftStorage.remove).mockImplementation(async () => {
    saved = null;
  });
  jest.mocked(workoutService.catalog).mockResolvedValue([exercise]);
  jest.mocked(workoutService.previous).mockResolvedValue([]);
  jest.mocked(workoutService.finish).mockResolvedValue('workout-1');
  jest.mocked(workoutService.detail).mockResolvedValue(workout);
  jest.mocked(workoutService.history).mockResolvedValue([workout]);
});
afterEach(async () => {
  await unmount();
  jest.restoreAllMocks();
});
async function createCompletedSet() {
  await press('Start workout');
  await press('Add Squat');
  await press('Go to active workout');
  await act(async () => {
    field('Set 1 weight (kg)').props.onChangeText('60');
    field('Set 1 reps').props.onChangeText('10');
  });
  await press('Complete set 1');
}
async function confirmFinish() {
  await press('Finish workout');
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => {
    await buttons.find(item => item.text === 'Finish and save')!.onPress!();
  });
  await flush();
}
test('full screen flow logs sets, saves, displays details/history, and invalidates Home', async () => {
  await mount();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await createCompletedSet();
  expect(saved!.exercises[0].sets[0]).toMatchObject({
    weight: '60',
    reps: '10',
    completed: true,
  });
  await confirmFinish();
  expect(workoutService.finish).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({
      clientId: expect.any(String),
      completedAt: expect.any(String),
    }),
  );
  expect(saved).toBeNull();
  expect(output()).toContain('Workout complete');
  expect(output()).toContain('Squat');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['home', 'user-1'] });
  await press('View history');
  expect(button('View workout')).toBeDefined();
  await press('View workout');
  expect(output()).toContain('Workout complete');
});
test('network failure keeps a frozen draft; app restart retries the identical request', async () => {
  await mount();
  await createCompletedSet();
  jest
    .mocked(workoutService.finish)
    .mockRejectedValueOnce(new Error('offline'));
  await confirmFinish();
  const pending = JSON.parse(JSON.stringify(saved));
  expect(saved!.completedAt).not.toBeNull();
  expect(field('Set 1 reps').props.editable).toBe(false);
  expect(draftStorage.remove).not.toHaveBeenCalled();
  await unmount();
  await mount();
  await press('Resume workout');
  await press('Retry finish');
  expect(workoutService.finish).toHaveBeenLastCalledWith('user-1', pending);
  expect(saved).toBeNull();
});
test('unfinished sets cannot finish, and editing a completed set resets completion', async () => {
  await mount();
  await createCompletedSet();
  await act(async () => {
    field('Set 1 reps').props.onChangeText('12');
  });
  await press('Finish workout');
  expect(output()).toContain('Complete at least one set');
  expect(workoutService.finish).not.toHaveBeenCalled();
  expect(saved!.exercises[0].sets[0].completed).toBe(false);
});
test('a storage read failure blocks starting and preserves the unreadable draft', async () => {
  jest.mocked(draftStorage.read).mockRejectedValueOnce(new Error('locked'));
  await mount();
  expect(output()).toContain('Retry draft');
  expect(draftStorage.write).not.toHaveBeenCalled();
  expect(draftStorage.remove).not.toHaveBeenCalled();
});
