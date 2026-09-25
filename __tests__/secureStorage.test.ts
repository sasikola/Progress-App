import * as Keychain from 'react-native-keychain';
import { secureStorage } from '../src/lib/secureStorage';

beforeEach(() => jest.clearAllMocks());
test('stores SDK values in namespaced device-only keychain entries', async () => {
  await secureStorage.setItem('auth-token', '{"test":"session"}');
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'session',
    '{"test":"session"}',
    {
      service: 'progress.auth-token',
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
});
test('reads stored data and treats an absent entry as signed out', async () => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({
    username: 'session',
    password: 'saved',
    service: 'progress.auth-token',
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });
  expect(await secureStorage.getItem('auth-token')).toBe('saved');
  expect(await secureStorage.getItem('missing')).toBeNull();
});
test('surfaces storage errors rather than falling back to plaintext', async () => {
  jest.mocked(Keychain.setGenericPassword).mockResolvedValueOnce(false);
  await expect(secureStorage.setItem('auth-token', 'value')).rejects.toThrow(
    'Secure storage',
  );
  jest
    .mocked(Keychain.getGenericPassword)
    .mockRejectedValueOnce(new Error('locked'));
  await expect(secureStorage.getItem('auth-token')).rejects.toThrow('locked');
});
test('removes only the requested session key', async () => {
  await secureStorage.removeItem('auth-token');
  expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
    service: 'progress.auth-token',
  });
});
