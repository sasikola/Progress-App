import { profileService } from '../src/services/profile/profileService';
import { profileErrorMessage } from '../src/services/profile/errors';
import { supabase } from '../src/lib/supabase';
import type { Goal } from '../src/services/profile/validation';

jest.mock('../src/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const row = {
  id: 'user-1',
  name: 'Alex',
  goal: 'muscle_gain',
  weight_unit: 'kg',
  onboarding_completed: true,
  created_at: '2026-09-25T00:00:00Z',
  updated_at: '2026-09-25T00:00:00Z',
};
const builder = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase!.from).mockReturnValue(builder as never);
  builder.maybeSingle.mockResolvedValue({ data: row, error: null });
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValue({ data: row, error: null } as never);
});

test('loads by auth user ID in profiles.id, without requesting user_id', async () => {
  await expect(profileService.getProfile('user-1')).resolves.toEqual({
    ...row,
    goal: 'build_muscle',
  });
  expect(builder.eq).toHaveBeenCalledWith('id', 'user-1');
  expect(builder.select.mock.calls[0][0]).not.toContain('user_id');
});

test('returns null for a missing profile and preserves a nullable legacy goal', async () => {
  builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  await expect(profileService.getProfile('user-1')).resolves.toBeNull();
  builder.maybeSingle.mockResolvedValueOnce({
    data: { ...row, goal: null, onboarding_completed: false },
    error: null,
  });
  await expect(profileService.getProfile('user-1')).resolves.toMatchObject({
    goal: null,
    onboarding_completed: false,
  });
});

test.each<[Goal, string]>([
  ['build_muscle', 'muscle_gain'],
  ['lose_fat', 'fat_loss'],
  ['get_stronger', 'strength'],
  ['improve_fitness', 'general_fitness'],
  ['maintain', 'maintenance'],
])('maps %s to %s on save and back on load', async (goal, databaseGoal) => {
  const data = { ...row, goal: databaseGoal };
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValueOnce({ data, error: null } as never);
  builder.maybeSingle.mockResolvedValueOnce({ data, error: null });
  await expect(
    profileService.completeOnboarding('user-1', { name: ' Alex ', goal }),
  ).resolves.toMatchObject({ goal });
  expect(supabase!.rpc).toHaveBeenCalledWith('complete_onboarding', {
    p_user_id: 'user-1',
    p_name: 'Alex',
    p_goal: databaseGoal,
    p_weight: null,
    p_weight_unit: 'kg',
  });
  await expect(profileService.getProfile('user-1')).resolves.toMatchObject({
    goal,
  });
});

test('saves profile and optional weight through one atomic RPC', async () => {
  await profileService.completeOnboarding('user-1', {
    name: 'Alex',
    goal: 'maintain',
    weight: { value: 150, unit: 'lb' },
  });
  expect(supabase!.rpc).toHaveBeenCalledTimes(1);
  expect(supabase!.rpc).toHaveBeenCalledWith(
    'complete_onboarding',
    expect.objectContaining({ p_weight: 150, p_weight_unit: 'lb' }),
  );
  expect(supabase!.from).not.toHaveBeenCalled();
});

test('propagates read and save errors rather than pretending a profile is missing', async () => {
  const error = { code: '42703' };
  builder.maybeSingle.mockResolvedValueOnce({ data: null, error });
  await expect(profileService.getProfile('user-1')).rejects.toEqual(error);
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValueOnce({ data: null, error } as never);
  await expect(
    profileService.completeOnboarding('user-1', {
      name: 'Alex',
      goal: 'maintain',
    }),
  ).rejects.toEqual(error);
  expect(profileErrorMessage(error)).toContain(
    'profile compatibility migration',
  );
});

test('rejects unexpected database goals rather than silently replacing them', async () => {
  builder.maybeSingle.mockResolvedValueOnce({
    data: { ...row, goal: 'unknown' },
    error: null,
  });
  await expect(profileService.getProfile('user-1')).rejects.toThrow();
});
