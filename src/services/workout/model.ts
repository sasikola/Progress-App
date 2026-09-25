import { z } from 'zod';

export const exerciseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
});
export type Exercise = z.infer<typeof exerciseSchema>;
const draftSetSchema = z.object({
  id: z.string(),
  weight: z.string(),
  reps: z.string(),
  unit: z.enum(['kg', 'lb']),
  completed: z.boolean(),
});
export type DraftSet = z.infer<typeof draftSetSchema>;
export const draftSchema = z.object({
  version: z.literal(1),
  clientId: z.string().min(8).max(100),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  exercises: z
    .array(
      z.object({
        exercise: exerciseSchema,
        sets: z.array(draftSetSchema).max(20),
      }),
    )
    .max(30),
});
export type WorkoutDraft = z.infer<typeof draftSchema>;
export const loggedSetSchema = z.object({
  weight: z.number().finite().min(0).max(2000),
  reps: z.number().int().min(1).max(1000),
  weight_unit: z.enum(['kg', 'lb']),
});
// These IDs provide stable local identity/idempotency, not security credentials.
export function localId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
export function newSet(unit: 'kg' | 'lb' = 'kg'): DraftSet {
  return { id: localId(), weight: '', reps: '', unit, completed: false };
}
export function parseSet(set: DraftSet) {
  if (
    !/^\d+(?:[.,]\d+)?$/.test(set.weight.trim()) ||
    !/^\d+$/.test(set.reps.trim())
  ) {
    throw new Error('Enter a weight (0 for bodyweight) and whole-number reps.');
  }
  const result = loggedSetSchema.safeParse({
    weight: Number(set.weight.replace(',', '.')),
    reps: Number(set.reps),
    weight_unit: set.unit,
  });
  if (!result.success)
    throw new Error('Use weight from 0–2,000 and reps from 1–1,000.');
  return result.data;
}
export function completedExercises(draft: WorkoutDraft) {
  const exercises = draft.exercises
    .map(item => ({
      exercise_id: item.exercise.id,
      sets: item.sets.filter(set => set.completed).map(parseSet),
    }))
    .filter(item => item.sets.length);
  if (!exercises.length)
    throw new Error('Complete at least one set before finishing.');
  return exercises;
}
export function elapsedSeconds(start: string, end = new Date().toISOString()) {
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
}
export function durationLabel(seconds: number | null) {
  if (seconds === null) return 'Duration not recorded';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${Math.floor(seconds % 60)}s`;
}
export type PersonalRecord = {
  exercise_id: string;
  name: string;
  weight_kg: number;
  previous_best_kg: number;
};
export type Workout = {
  id: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number | null;
  exercise_count: number;
  set_count: number;
  volume_kg: number;
  records: PersonalRecord[];
};
export type WorkoutDetail = Workout & {
  workout_exercises: {
    id: string;
    order_index: number;
    exercises: Exercise;
    workout_sets: {
      id: string;
      set_number: number;
      weight: number;
      weight_unit: 'kg' | 'lb';
      reps: number;
      completed: boolean;
    }[];
  }[];
};
export type PreviousSet = {
  weight: number;
  weight_unit: 'kg' | 'lb';
  reps: number;
  set_number: number;
  completed_at: string;
};
