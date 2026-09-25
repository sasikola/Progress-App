import { useQuery } from '@tanstack/react-query';
import { homeService } from './homeService';

export function useHome(userId: string | undefined) {
  const weights = useQuery({
    queryKey: ['home', userId, 'weights'],
    queryFn: ({ signal }) => homeService.getWeights(userId!, signal),
    enabled: Boolean(userId),
  });
  const recentWorkout = useQuery({
    queryKey: ['home', userId, 'recent-workout'],
    queryFn: ({ signal }) => homeService.getRecentWorkout(userId!, signal),
    enabled: Boolean(userId),
  });
  return { weights, recentWorkout };
}
