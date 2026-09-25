import { supabase } from '../../lib/supabase';
import { z } from 'zod';
import type { Goal, WeightUnit } from './validation';

const databaseGoals = {
  build_muscle: 'muscle_gain',
  lose_fat: 'fat_loss',
  get_stronger: 'strength',
  improve_fitness: 'general_fitness',
  maintain: 'maintenance',
} as const satisfies Record<Goal, string>;

const profileRow = z.object({
  id: z.string(),
  name: z.string(),
  goal: z
    .enum([
      'muscle_gain',
      'fat_loss',
      'strength',
      'general_fitness',
      'maintenance',
    ])
    .nullable(),
  weight_unit: z.enum(['kg', 'lb']),
  onboarding_completed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

function toProfile(value: unknown): Profile {
  const row = profileRow.parse(value);
  const goal =
    (Object.keys(databaseGoals) as Goal[]).find(
      key => databaseGoals[key] === row.goal,
    ) ?? null;
  return { ...row, goal };
}

function client() {
  if (!supabase) throw new Error('Profile access is not configured.');
  return supabase;
}

export type Profile = {
  id: string;
  name: string;
  goal: Goal | null;
  weight_unit: WeightUnit;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type CompleteOnboardingInput = {
  name: string;
  goal: Goal;
  weight?: { value: number; unit: WeightUnit };
};

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await client()
      .from('profiles')
      .select(
        'id,name,goal,weight_unit,onboarding_completed,created_at,updated_at',
      )
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data === null ? null : toProfile(data);
  },
  async completeOnboarding(
    userId: string,
    input: CompleteOnboardingInput,
  ): Promise<Profile> {
    // One transaction: a retry cannot duplicate the starting weight or leave
    // onboarding half-saved. The server validates ownership against auth.uid().
    const { data, error } = await client().rpc('complete_onboarding', {
      p_user_id: userId,
      p_name: input.name.trim(),
      p_goal: databaseGoals[input.goal],
      p_weight: input.weight?.value ?? null,
      p_weight_unit: input.weight?.unit ?? 'kg',
    });
    if (error) throw error;
    return toProfile(data);
  },
};
