import { supabase } from '../../lib/supabase';
import type { WeightUnit } from '../profile/validation';

export type WeightEntry = {
  id: string;
  weight: number;
  unit: WeightUnit;
  recorded_at: string;
};
export type RecentWorkout = {
  id: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number | null;
};
export type WorkoutSummary = {
  available: boolean;
  workout: RecentWorkout | null;
};
function client() {
  if (!supabase) throw new Error('Home access is not configured.');
  return supabase;
}
export const homeService = {
  async getWeights(
    userId: string,
    signal: AbortSignal,
  ): Promise<WeightEntry[]> {
    const { data, error } = await client()
      .from('weight_entries')
      .select('id, weight, unit, recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(2)
      .abortSignal(signal);
    if (error) throw error;
    return data ?? [];
  },
  async getRecentWorkout(
    userId: string,
    signal: AbortSignal,
  ): Promise<WorkoutSummary> {
    const { data, error } = await client()
      .from('workouts')
      .select('id, started_at, completed_at, duration_seconds')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .abortSignal(signal);
    // Phase 4 owns the workouts schema. Only a missing table is optional;
    // network, policy, and malformed-schema errors must remain visible.
    if (error && ['42P01', 'PGRST205'].includes(error.code)) {
      return { available: false, workout: null };
    }
    if (error) throw error;
    return { available: true, workout: data?.[0] ?? null };
  },
};

export function weightChange(
  entries: WeightEntry[],
): { value: number; unit: WeightUnit } | null {
  const [latest, previous] = entries;
  if (!latest || !previous) return null;
  const previousInLatestUnit =
    previous.unit === latest.unit
      ? previous.weight
      : latest.unit === 'kg'
      ? previous.weight / 2.2046226218
      : previous.weight * 2.2046226218;
  return {
    value: Math.round((latest.weight - previousInLatestUnit) * 10) / 10,
    unit: latest.unit,
  };
}
