import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfile } from '../src/services/profile/useProfile';
import { useCompleteOnboarding } from '../src/services/profile/useCompleteOnboarding';
import { profileService } from '../src/services/profile/profileService';

jest.mock('../src/services/profile/profileService', () => ({
  profileService: { getProfile: jest.fn(), completeOnboarding: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

// Avoid retaining TanStack Query's default five-minute GC timers after tests.
const clients: QueryClient[] = [];
function testClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  clients.push(client);
  return client;
}
afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
});

test('useProfile fetches the profile for the given user id', async () => {
  const profile = { id: '1', user_id: 'user-1', onboarding_completed: false };
  jest.mocked(profileService.getProfile).mockResolvedValue(profile as never);
  let latest: ReturnType<typeof useProfile> | undefined;
  function Probe() {
    latest = useProfile('user-1');
    return null;
  }
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={testClient()}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
  expect(profileService.getProfile).toHaveBeenCalledWith('user-1');
  expect(latest?.data).toEqual(profile);
  await act(async () => view.unmount());
});

test('useProfile stays disabled without a user id', async () => {
  let latest: ReturnType<typeof useProfile> | undefined;
  function Probe() {
    latest = useProfile(undefined);
    return null;
  }
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={testClient()}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  expect(profileService.getProfile).not.toHaveBeenCalled();
  expect(latest?.isLoading).toBe(false);
  await act(async () => view.unmount());
});

test('useCompleteOnboarding caches the resulting profile under the same query key', async () => {
  const profile = { id: '1', user_id: 'user-1', onboarding_completed: true };
  jest
    .mocked(profileService.completeOnboarding)
    .mockResolvedValue(profile as never);
  const client = testClient();
  let latest: ReturnType<typeof useCompleteOnboarding> | undefined;
  function Probe() {
    latest = useCompleteOnboarding();
    return null;
  }
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await latest!.mutateAsync({
      userId: 'user-1',
      name: 'Alex',
      goal: 'maintain',
    });
  });
  expect(client.getQueryData(['profile', 'user-1'])).toEqual(profile);
  await act(async () => view.unmount());
});
