import { authService } from '../src/services/auth/authService';
import { supabase } from '../src/lib/supabase';
import { secureStorage } from '../src/lib/secureStorage';

jest.mock('../src/lib/supabase', () => ({
  recoveryStorageKey: 'test-recovery',
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signOut: jest.fn(),
      updateUser: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));
jest.mock('../src/lib/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const auth = jest.mocked(supabase!.auth);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(secureStorage.getItem).mockResolvedValue(null);
});
test('sign-in passes credentials to Supabase and surfaces invalid credentials', async () => {
  const error = { code: 'invalid_credentials' };
  auth.signInWithPassword.mockResolvedValueOnce({
    data: { user: null, session: null },
    error,
  } as Awaited<ReturnType<typeof auth.signInWithPassword>>);
  await expect(
    authService.signIn({ email: 'user@example.com', password: 'wrong' }),
  ).rejects.toEqual(error);
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'wrong',
  });
});
test('signup tells the UI when email confirmation is required', async () => {
  auth.signUp.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: null,
  });
  expect(
    await authService.signUp({
      email: 'user@example.com',
      password: 'long-password',
    }),
  ).toEqual({ confirmationRequired: true });
  expect(auth.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: { emailRedirectTo: 'progress://auth/confirm' },
    }),
  );
});
test('reset requests do not disclose a missing account', async () => {
  auth.resetPasswordForEmail.mockResolvedValueOnce({
    data: null,
    error: { code: 'user_not_found' },
  } as Awaited<ReturnType<typeof auth.resetPasswordForEmail>>);
  await expect(
    authService.requestPasswordReset('user@example.com'),
  ).resolves.toBeUndefined();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
    redirectTo: 'progress://auth/recovery',
  });
});
test('failed sign-out keeps recovery data for retry', async () => {
  const error = { code: 'network_error' };
  auth.signOut.mockResolvedValueOnce({ error } as Awaited<
    ReturnType<typeof auth.signOut>
  >);
  await expect(authService.signOut()).rejects.toEqual(error);
  expect(secureStorage.removeItem).not.toHaveBeenCalled();
});
test('successful sign-out uses local scope and removes recovery state', async () => {
  auth.signOut.mockResolvedValueOnce({ error: null });
  await authService.signOut();
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(secureStorage.removeItem).toHaveBeenCalledWith('test-recovery');
});
test('validates link sessions with Supabase before opening recovery', async () => {
  const session = { user: { id: 'user-1' } };
  auth.setSession.mockResolvedValueOnce({
    data: { session, user: session.user },
    error: null,
  } as Awaited<ReturnType<typeof auth.setSession>>);
  expect(
    await authService.acceptLink(
      'progress://auth/recovery#access_token=a&refresh_token=b',
    ),
  ).toEqual({ session, recovery: true });
  expect(auth.setSession).toHaveBeenCalledWith({
    access_token: 'a',
    refresh_token: 'b',
  });
  expect(secureStorage.setItem).toHaveBeenNthCalledWith(
    1,
    'test-recovery',
    'pending',
  );
  expect(secureStorage.setItem).toHaveBeenNthCalledWith(
    2,
    'test-recovery',
    'user-1',
  );
});
test('rejects expired links and rolls back the provisional recovery marker', async () => {
  auth.setSession.mockResolvedValueOnce({
    data: { session: null, user: null },
    error: { code: 'otp_expired' },
  } as Awaited<ReturnType<typeof auth.setSession>>);
  await expect(
    authService.acceptLink(
      'progress://auth/recovery#access_token=a&refresh_token=b',
    ),
  ).rejects.toEqual({ code: 'otp_expired' });
  expect(secureStorage.removeItem).toHaveBeenCalledWith('test-recovery');
});
test('password updates clear recovery only after server success', async () => {
  auth.updateUser.mockResolvedValueOnce({
    data: { user: null },
    error: { code: 'weak_password' },
  } as Awaited<ReturnType<typeof auth.updateUser>>);
  await expect(authService.updatePassword('short')).rejects.toEqual({
    code: 'weak_password',
  });
  expect(secureStorage.removeItem).not.toHaveBeenCalled();
});
