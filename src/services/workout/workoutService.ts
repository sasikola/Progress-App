import { supabase } from '../../lib/supabase';
import {
  completedExercises,
  draftSchema,
  exerciseSchema,
  type WorkoutDraft,
  type Workout,
  type WorkoutDetail,
  type PreviousSet,
} from './model';

function client() {
  if (!supabase) throw new Error('Workout access is not configured.');
  return supabase;
}
const summaryColumns =
  'id, started_at, completed_at, duration_seconds, exercise_count, set_count, volume_kg, records';
export const historyPageSize = 20;
export const workoutService = {
  async catalog(signal: AbortSignal) {
    const { data, error } = await client()
      .from('exercises')
      .select('id, name, category, description')
      .order('name')
      .abortSignal(signal);
    if (error) throw error;
    return exerciseSchema.array().parse(data ?? []);
  },
  async finish(userId: string, draft: WorkoutDraft): Promise<string> {
    draftSchema.parse(draft);
    if (!draft.completedAt) throw new Error('Finish time is required.');
    const { data, error } = await client().rpc('finish_workout', {
      p_user_id: userId,
      p_client_id: draft.clientId,
      p_started_at: draft.startedAt,
      p_completed_at: draft.completedAt,
      p_exercises: completedExercises(draft),
    });
    if (error) throw error;
    if (typeof data !== 'string')
      throw new Error('Unexpected workout response.');
    return data;
  },
  async history(
    userId: string,
    page: number,
    signal: AbortSignal,
  ): Promise<Workout[]> {
    const { data, error } = await client()
      .from('workouts')
      .select(summaryColumns)
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * historyPageSize, (page + 1) * historyPageSize - 1)
      .abortSignal(signal);
    if (error) throw error;
    return (data ?? []) as Workout[];
  },
  async detail(
    userId: string,
    id: string,
    signal: AbortSignal,
  ): Promise<WorkoutDetail> {
    const { data, error } = await client()
      .from('workouts')
      .select(
        `${summaryColumns}, workout_exercises(id, order_index, exercises(id, name, category, description), workout_sets(id, set_number, weight, weight_unit, reps, completed))`,
      )
      .eq('user_id', userId)
      .eq('id', id)
      .abortSignal(signal)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutDetail;
  },
  async previous(
    exerciseId: string,
    signal: AbortSignal,
  ): Promise<PreviousSet[]> {
    const { data, error } = await client()
      .rpc('previous_exercise_sets', { p_exercise_id: exerciseId })
      .abortSignal(signal);
    if (error) throw error;
    return (data ?? []) as PreviousSet[];
  },
};
export function workoutError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  if (
    ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(
      String(code),
    )
  ) {
    return 'Workout setup is not ready. Apply the Phase 4 SQL migration in Supabase, then retry.';
  }
  return 'We couldn’t complete that request. Your draft is kept. Check your connection and try again.';
}
