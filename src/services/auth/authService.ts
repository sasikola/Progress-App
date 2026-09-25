import { recoveryStorageKey, supabase } from '../../lib/supabase';
import { secureStorage } from '../../lib/secureStorage';
import { confirmationRedirect, recoveryRedirect, parseAuthLink } from './links';
import type { SignInValues } from './validation';

function client() {
  if (!supabase) throw new Error('Authentication is not configured.');
  return supabase;
}

export const authService = {
  async signIn(values: SignInValues) {
    await secureStorage.removeItem(recoveryStorageKey);
    const { error } = await client().auth.signInWithPassword(values);
    if (error) throw error;
  },
  async signUp(values: SignInValues) {
    await secureStorage.removeItem(recoveryStorageKey);
    const { data, error } = await client().auth.signUp({
      ...values,
      options: { emailRedirectTo: confirmationRedirect },
    });
    // Do not reveal whether an address is already registered.
    if (
      error &&
      !['user_already_exists', 'email_exists'].includes(error.code ?? '')
    )
      throw error;
    return { confirmationRequired: !data.session };
  },
  async requestPasswordReset(email: string) {
    const { error } = await client().auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirect,
    });
    if (error && error.code !== 'user_not_found') throw error;
  },
  async updatePassword(password: string) {
    const { error } = await client().auth.updateUser({ password });
    if (error) throw error;
    await secureStorage.removeItem(recoveryStorageKey);
  },
  async signOut() {
    const { error } = await client().auth.signOut({ scope: 'local' });
    if (error) throw error;
    await secureStorage.removeItem(recoveryStorageKey);
  },
  async acceptLink(url: string) {
    const link = parseAuthLink(url);
    if (link.kind !== 'session')
      throw new Error('Invalid authentication link.');
    const previous = await secureStorage.getItem(recoveryStorageKey);
    // Mark recovery before saving the SDK session so restarting mid-flow cannot
    // accidentally open the main app instead of the new-password screen.
    if (link.recovery)
      await secureStorage.setItem(recoveryStorageKey, 'pending');
    let sessionSaved = false;
    try {
      const { data, error } = await client().auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
      if (error || !data.session)
        throw error ?? new Error('Invalid authentication session.');
      sessionSaved = true;
      if (link.recovery)
        await secureStorage.setItem(recoveryStorageKey, data.session.user.id);
      else await secureStorage.removeItem(recoveryStorageKey);
      return { session: data.session, recovery: link.recovery };
    } catch (error) {
      if (!sessionSaved) {
        if (previous) await secureStorage.setItem(recoveryStorageKey, previous);
        else await secureStorage.removeItem(recoveryStorageKey);
      }
      throw error;
    }
  },
};
