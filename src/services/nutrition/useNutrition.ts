import { useEffect, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { NutritionValues } from './calculations';
import {
  type CustomFoodInput,
  type LogFoodEntryInput,
  type QuantityUnit,
  type SetNutritionTargetInput,
} from './model';
import { nutritionService } from './nutritionService';

export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useFoodSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 350);
  return useQuery({
    queryKey: ['nutrition', 'search', debounced],
    queryFn: ({ signal }) => nutritionService.searchFoods(debounced, signal),
    enabled: debounced.length >= 2,
  });
}

export function useFood(foodId: string | undefined) {
  return useQuery({
    queryKey: ['nutrition', 'food', foodId],
    queryFn: ({ signal }) => nutritionService.getFood(foodId!, signal),
    enabled: Boolean(foodId),
  });
}

export function useDailyNutrition(
  userId: string | undefined,
  localDate: string,
) {
  const entries = useQuery({
    queryKey: ['nutrition', userId, 'entries', localDate],
    queryFn: ({ signal }) =>
      nutritionService.entriesForDate(userId!, localDate, signal),
    enabled: Boolean(userId),
  });
  const target = useQuery({
    queryKey: ['nutrition', userId, 'target', localDate],
    queryFn: ({ signal }) =>
      nutritionService.currentTarget(userId!, localDate, signal),
    enabled: Boolean(userId),
  });
  return { entries, target };
}

export function useLogFoodEntry(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogFoodEntryInput) =>
      nutritionService.logEntry(userId, input),
    onSuccess: entry => {
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'entries', entry.local_date],
      });
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'recent-foods'],
      });
    },
  });
}

export function useUpdateFoodEntry(userId: string, localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: {
      entryId: string;
      quantity: number;
      unit: QuantityUnit;
      nutrition: NutritionValues;
    }) =>
      nutritionService.updateEntry(
        update.entryId,
        update.quantity,
        update.unit,
        update.nutrition,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'entries', localDate],
      });
    },
  });
}

export function useDeleteFoodEntry(userId: string, localDate: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => nutritionService.deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'entries', localDate],
      });
    },
  });
}

export function useSetNutritionTarget(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetNutritionTargetInput) =>
      nutritionService.setTarget(userId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'target'],
      });
    },
  });
}

// One-shot lookup (manual barcode entry today; the same call a future
// camera scanner would make), so a mutation fits better than a query that
// would auto-fetch on mount.
export function useLookupBarcode() {
  return useMutation({
    mutationFn: (barcode: string) =>
      nutritionService.getFoodByBarcode(barcode, new AbortController().signal),
  });
}

export function useRecentFoods(userId: string | undefined) {
  return useQuery({
    queryKey: ['nutrition', userId, 'recent-foods'],
    queryFn: ({ signal }) => nutritionService.recentFoods(signal),
    enabled: Boolean(userId),
  });
}

export function useFavoriteFoods(userId: string | undefined) {
  return useQuery({
    queryKey: ['nutrition', userId, 'favorites'],
    queryFn: ({ signal }) => nutritionService.favoriteFoods(userId!, signal),
    enabled: Boolean(userId),
  });
}

export function useToggleFavorite(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      foodId,
      favorited,
    }: {
      foodId: string;
      favorited: boolean;
    }) =>
      favorited
        ? nutritionService.removeFavorite(userId, foodId)
        : nutritionService.addFavorite(userId, foodId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'favorites'],
      });
    },
  });
}

export function useMyCustomFoods(userId: string | undefined) {
  return useQuery({
    queryKey: ['nutrition', userId, 'custom-foods'],
    queryFn: ({ signal }) => nutritionService.myCustomFoods(userId!, signal),
    enabled: Boolean(userId),
  });
}

export function useCreateCustomFood(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomFoodInput) =>
      nutritionService.createCustomFood(userId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['nutrition', userId, 'custom-foods'],
      });
    },
  });
}
