import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from './queryClient';
import { AuthProvider } from '../services/auth/AuthProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(createQueryClient);
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state =>
      focusManager.setFocused(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
