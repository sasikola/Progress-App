import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Linking } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { recoveryStorageKey, supabase } from '../../lib/supabase';
import { secureStorage } from '../../lib/secureStorage';
import { authService } from './authService';
import { parseAuthLink } from './links';

type AuthContextValue = {
  session: Session | null;
  status: 'loading' | 'ready' | 'error';
  recovery: boolean;
  configured: boolean;
  linkError: string | null;
  retry: () => void;
  dismissLinkError: () => void;
  finishRecovery: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [recovery, setRecovery] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const currentUser = useRef<string | null>(null);
  const lastAcceptedUrl = useRef<string | null>(null);
  const applySession = useCallback(
    (next: Session | null) => {
      const nextId = next?.user.id ?? null;
      if (currentUser.current !== nextId) {
        queryClient.cancelQueries();
        queryClient.clear();
        currentUser.current = nextId;
      }
      setSession(next);
      if (!next) setRecovery(false);
    },
    [queryClient],
  );

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setStatus('ready');
      return;
    }
    let active = true;
    let revision = 0;
    let chain = Promise.resolve();
    setStatus('loading');

    async function handleLink(url: string) {
      const link = parseAuthLink(url);
      if (!active || link.kind === 'ignored' || lastAcceptedUrl.current === url)
        return;
      if (link.kind === 'invalid') {
        setLinkError(
          'This link is invalid or has expired. Please request a new email.',
        );
        return;
      }
      setStatus('loading');
      setLinkError(null);
      if (link.recovery) setRecovery(true);
      try {
        const result = await authService.acceptLink(url);
        if (active) {
          applySession(result.session);
          setRecovery(result.recovery);
          lastAcceptedUrl.current = url;
        }
      } catch {
        if (active)
          setLinkError(
            'We couldn’t open this link. It may have expired, or your connection may be unavailable. Please request a new email.',
          );
      } finally {
        if (active) setStatus('ready');
      }
    }

    // Keep subscription side effects synchronous; auth requests live in services.
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      revision += 1;
      applySession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    async function restore() {
      try {
        const before = revision;
        const { data, error } = await client!.auth.getSession();
        if (error) throw error;
        const marker = await secureStorage.getItem(recoveryStorageKey);
        if (!active) return;
        if (revision === before) applySession(data.session);
        setRecovery(
          Boolean(
            data.session &&
              marker &&
              (marker === 'pending' || marker === data.session.user.id),
          ),
        );
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await handleLink(initialUrl);
        if (active) setStatus('ready');
      } catch {
        if (active) setStatus('error');
      }
    }
    chain = restore();
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      chain = chain.then(() => handleLink(url));
    });
    const refresh = (state: string | null | undefined) => {
      const task =
        state === 'active'
          ? client.auth.startAutoRefresh()
          : client.auth.stopAutoRefresh();
      task.catch(() => {
        if (active) setStatus('error');
      });
    };
    refresh(AppState.currentState);
    const appSubscription = AppState.addEventListener('change', refresh);
    return () => {
      active = false;
      subscription.unsubscribe();
      linkSubscription.remove();
      appSubscription.remove();
      client.auth.stopAutoRefresh().catch(() => {});
    };
  }, [applySession, attempt]);

  return (
    <AuthContext.Provider
      value={{
        session,
        status,
        recovery,
        configured: Boolean(supabase),
        linkError,
        retry: () => setAttempt(value => value + 1),
        dismissLinkError: () => setLinkError(null),
        finishRecovery: () => setRecovery(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
