import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { HomeScreen } from '../src/screens/home/HomeScreen';
import { ProfileStepScreen } from '../src/screens/onboarding/ProfileStepScreen';
import { ErrorState } from '../src/components/feedback/States';

const session = { user: { id: 'user-1' } };
let mockAuthValue: Record<string, unknown>;
let mockProfileValue: Record<string, unknown>;

jest.mock('../src/services/home/useHome', () => ({
  useHome: () => ({
    weights: { data: [], refetch: jest.fn() },
    recentWorkout: {
      data: { available: false, workout: null },
      refetch: jest.fn(),
    },
  }),
}));

jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => mockAuthValue,
}));
jest.mock('../src/services/profile/useProfile', () => ({
  useProfile: () => mockProfileValue,
}));

async function render() {
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                queries: { gcTime: Infinity },
                mutations: { gcTime: Infinity },
              },
            })
          }
        >
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return view;
}

beforeEach(() => {
  mockAuthValue = {
    session,
    status: 'ready',
    recovery: false,
    linkError: null,
    retry: jest.fn(),
    dismissLinkError: jest.fn(),
  };
});

test('sends a user with no profile row into onboarding', async () => {
  mockProfileValue = {
    data: null,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const view = await render();
  expect(view.root.findAllByType(ProfileStepScreen)).toHaveLength(1);
  expect(view.root.findAllByType(HomeScreen)).toHaveLength(0);
  await act(async () => view.unmount());
});

test('sends a user with incomplete onboarding into onboarding', async () => {
  mockProfileValue = {
    data: { onboarding_completed: false },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const view = await render();
  expect(view.root.findAllByType(ProfileStepScreen)).toHaveLength(1);
  await act(async () => view.unmount());
});

test('sends a user with completed onboarding into the main app', async () => {
  mockProfileValue = {
    data: { onboarding_completed: true },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const view = await render();
  expect(view.root.findAllByType(HomeScreen)).toHaveLength(1);
  expect(view.root.findAllByType(ProfileStepScreen)).toHaveLength(0);
  await act(async () => view.unmount());
});

test('explains a missing profile migration instead of treating it as no profile', async () => {
  mockProfileValue = {
    data: undefined,
    isLoading: false,
    isError: true,
    error: { code: '42703' },
    refetch: jest.fn(),
  };
  const view = await render();
  expect(view.root.findByType(ErrorState).props.description).toContain(
    'profile compatibility migration',
  );
  expect(view.root.findAllByType(ProfileStepScreen)).toHaveLength(0);
  await act(async () => view.unmount());
});
