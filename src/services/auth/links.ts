import 'react-native-url-polyfill/auto';

export const confirmationRedirect = 'progress://auth/confirm';
export const recoveryRedirect = 'progress://auth/recovery';

export type AuthLink =
  | { kind: 'ignored' }
  | { kind: 'invalid' }
  | {
      kind: 'session';
      recovery: boolean;
      accessToken: string;
      refreshToken: string;
    };

export function parseAuthLink(value: string): AuthLink {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'progress:' ||
      url.hostname !== 'auth' ||
      url.port ||
      url.username ||
      url.password ||
      !['/confirm', '/recovery'].includes(url.pathname)
    )
      return { kind: 'ignored' };
    const params = new URLSearchParams(url.hash.slice(1));
    if (
      url.searchParams.has('error') ||
      url.searchParams.has('error_code') ||
      params.has('error') ||
      params.has('error_code')
    )
      return { kind: 'invalid' };
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return { kind: 'invalid' };
    return {
      kind: 'session',
      recovery:
        url.pathname === '/recovery' || params.get('type') === 'recovery',
      accessToken,
      refreshToken,
    };
  } catch {
    return { kind: 'ignored' };
  }
}
