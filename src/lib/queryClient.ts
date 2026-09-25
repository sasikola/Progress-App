import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: true },
      // Mutations must explicitly opt into retries when they are idempotent.
      mutations: { retry: false },
    },
  });
}
