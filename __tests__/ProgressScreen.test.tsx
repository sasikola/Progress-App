import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressScreen } from '../src/screens/progress/ProgressScreen';
import { TextInput } from '../src/components/inputs/TextInput';
import { Button } from '../src/components/buttons/Button';
import { progressService } from '../src/services/progress/progressService';

jest.mock('../src/services/progress/progressService', () => ({
  progressService: {
    overview: jest.fn(),
    history: jest.fn(),
    records: jest.fn(),
    save: jest.fn(),
  },
}));
jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.mock('../src/services/profile/useProfile', () => ({
  useProfile: () => ({ data: { weight_unit: 'kg' } }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
  useFocusEffect: (effect: () => void) => {
    require('react').useEffect(effect, [effect]);
  },
}));
jest.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
const service = jest.mocked(progressService);
let view: ReactTestRenderer.ReactTestRenderer;
let client: QueryClient;
const flush = async () => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
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
          <ProgressScreen />
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
async function save() {
  await act(async () => {
    await view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Save entry')!
      .props.onPress();
  });
  await flush();
}
async function typeValue(value: string) {
  await act(async () => {
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label.startsWith('Value'))!
      .props.onChangeText(value);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  service.overview.mockResolvedValue({
    workout_count: 3,
    set_count: 12,
    volume_kg: 2500,
    weights: [],
  });
  service.history.mockResolvedValue({ entries: [], next: null });
  service.records.mockResolvedValue({ entries: [], next: null });
  service.save.mockResolvedValue('entry-id');
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  client.clear();
});

test('shows real overview and empty records without fabricated achievements', async () => {
  await render();
  expect(output()).toContain('workouts');
  expect(service.overview).toHaveBeenCalled();
  await choose('Records');
  expect(output()).toContain('Your records start here');
});
test('validates weight, preserves failed input and reuses the same request on retry', async () => {
  client.setQueryData(['home', 'user-1', 'weights'], []);
  client.setQueryData(['home', 'user-2', 'weights'], []);
  await render();
  await choose('Weight');
  await typeValue('-5');
  await save();
  expect(service.save).not.toHaveBeenCalled();
  expect(output()).toContain('greater than 0');
  service.save.mockRejectedValueOnce(new Error('timeout'));
  await typeValue('70.5');
  await save();
  expect(
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label.startsWith('Value'))!.props.value,
  ).toBe('70.5');
  const first = service.save.mock.calls[0];
  await save();
  expect(service.save.mock.calls[1]).toEqual(first);
  expect(first[0]).toBe('user-1');
  expect(first[1]).toMatchObject({ kind: 'weight', value: 70.5, unit: 'kg' });
  expect(output()).toContain('Entry saved.');
  expect(
    client.getQueryState(['home', 'user-1', 'weights'])?.isInvalidated,
  ).toBe(true);
  expect(
    client.getQueryState(['home', 'user-2', 'weights'])?.isInvalidated,
  ).toBe(false);
});
test('keeps body areas separate and sends measurement units and type', async () => {
  await render();
  await choose('Measurements');
  await choose('Left arm');
  await choose('in');
  await typeValue('12.5');
  await save();
  expect(service.save).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ kind: 'left_arm', value: 12.5, unit: 'in' }),
  );
  expect(service.history).toHaveBeenCalledWith(
    'left_arm',
    null,
    expect.anything(),
  );
});
test('shows migration errors rather than an empty dashboard', async () => {
  service.overview.mockRejectedValue({ code: 'PGRST202' });
  await render();
  expect(output()).toContain('Phase 5 SQL migration');
  expect(output()).toContain('Retry overview');
});
test('loads older entries from the last visible cursor', async () => {
  const entry = {
    id: 'entry-1',
    value: 70,
    unit: 'kg' as const,
    recorded_at: '2026-09-25T12:00:00Z',
  };
  service.history.mockResolvedValueOnce({ entries: [entry], next: entry });
  await render();
  await choose('Weight');
  await act(async () => {
    await view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Load older entries')!
      .props.onPress();
  });
  await flush();
  expect(service.history).toHaveBeenLastCalledWith(
    'weight',
    entry,
    expect.anything(),
  );
});
