import * as Keychain from 'react-native-keychain';

// Supabase owns the session JSON. Store each SDK key separately, including any
// auxiliary auth keys. Never fall back to unencrypted storage on failure.
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const entry = await Keychain.getGenericPassword({
      service: `progress.${key}`,
    });
    return entry ? entry.password : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const result = await Keychain.setGenericPassword('session', value, {
      service: `progress.${key}`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (!result) throw new Error('Secure storage is unavailable.');
  },
  async removeItem(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: `progress.${key}` });
  },
};
