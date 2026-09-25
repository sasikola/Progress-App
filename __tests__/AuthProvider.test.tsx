import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState, Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../src/services/auth/AuthProvider';
import { supabase } from '../src/lib/supabase';
import { secureStorage } from '../src/lib/secureStorage';
import { authService } from '../src/services/auth/authService';

jest.mock('../src/lib/supabase', () => ({
  recoveryStorageKey: 'test-recovery',
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      startAutoRefresh: jest.fn().mockResolvedValue(undefined),
      stopAutoRefresh: jest.fn().mockResolvedValue(undefined),
    },
  },
}));
jest.mock('../src/lib/secureStorage', () => ({
  secureStorage: { getItem: jest.fn() },
}));
jest.mock('../src/services/auth/authService', () => ({
  authService: { acceptLink: jest.fn() },
}));

const auth = jest.mocked(supabase!.auth);
const session: Session = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'user-1',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-09-23T00:00:00Z',
  },
};
let latest: ReturnType<typeof useAuth>;
let view: ReactTestRenderer.ReactTestRenderer | undefined;
function Probe() {
  latest = useAuth();
  return null;
}
async function mount(client = new QueryClient()) {
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
  return client;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  jest.mocked(secureStorage.getItem).mockResolvedValue(null);
});
afterEach(async () => {
  if (view) await act(async () => view!.unmount());
  view = undefined;
  jest.restoreAllMocks();
});
test('restores an existing session and cleans up auth subscriptions', async () => {
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  await mount();
  expect(latest.status).toBe('ready');
  expect(latest.session?.user.id).toBe('user-1');
  const subscription =
    auth.onAuthStateChange.mock.results[0].value.data.subscription;
  await act(async () => view!.unmount());
  view = undefined;
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
});
test('clears cached user data on sign out or account change', async () => {
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  const client = await mount();
  client.setQueryData(['private-weight'], 'sensitive');
  await act(async () => {
    auth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null);
  });
  expect(latest.session).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
test('storage/session failures offer retry instead of exposing main content', async () => {
  auth.getSession.mockRejectedValueOnce(new Error('storage locked'));
  await mount();
  expect(latest.status).toBe('error');
  await act(async () => latest.retry());
  expect(latest.status).toBe('ready');
  expect(latest.session).toBeNull();
});
test('restores the password-recovery gate after app restart', async () => {
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  jest.mocked(secureStorage.getItem).mockResolvedValue('user-1');
  await mount();
  expect(latest.recovery).toBe(true);
});
test('cold-start recovery links resolve before the app becomes ready', async () => {
  jest
    .mocked(Linking.getInitialURL)
    .mockResolvedValue(
      'progress://auth/recovery#access_token=a&refresh_token=b',
    );
  jest
    .mocked(authService.acceptLink)
    .mockResolvedValue({ session, recovery: true });
  await mount();
  expect(latest.status).toBe('ready');
  expect(latest.recovery).toBe(true);
  expect(latest.session?.user.id).toBe('user-1');
});
test('refresh runs only while foregrounded', async () => {
  const events = jest.spyOn(AppState, 'addEventListener');
  await mount();
  const callback = events.mock.calls.find(([name]) => name === 'change')![1];
  await act(async () => callback('background'));
  expect(auth.stopAutoRefresh).toHaveBeenCalled();
  await act(async () => callback('active'));
  expect(auth.startAutoRefresh).toHaveBeenCalled();
});
test('warm recovery links are handled once and malformed links are recoverable', async () => {
  const events = jest.spyOn(Linking, 'addEventListener');
  jest
    .mocked(authService.acceptLink)
    .mockResolvedValue({ session, recovery: true });
  await mount();
  const callback = events.mock.calls.find(([name]) => name === 'url')![1];
  const url = 'progress://auth/recovery#access_token=a&refresh_token=b';
  await act(async () => {
    callback({ url });
  });
  expect(latest.recovery).toBe(true);
  expect(latest.session?.user.id).toBe('user-1');
  await act(async () => {
    callback({ url });
  });
  expect(authService.acceptLink).toHaveBeenCalledTimes(1);
  await act(async () => {
    callback({ url: 'progress://auth/recovery#error_code=otp_expired' });
  });
  expect(latest.linkError).toContain('expired');
  await act(async () => latest.dismissLinkError());
  expect(latest.linkError).toBeNull();
  expect(latest.recovery).toBe(true);
});
