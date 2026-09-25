import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileService, type CompleteOnboardingInput } from './profileService';

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompleteOnboardingInput & { userId: string }) =>
      profileService.completeOnboarding(input.userId, input),
    onSuccess: (profile, variables) => {
      queryClient.setQueryData(['profile', variables.userId], profile);
    },
  });
}
