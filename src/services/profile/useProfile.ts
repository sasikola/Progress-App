import { useQuery } from '@tanstack/react-query';
import { profileService } from './profileService';

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => profileService.getProfile(userId!),
    enabled: Boolean(userId),
  });
}
