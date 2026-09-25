import { workoutService } from '../src/services/workout/workoutService';
import { supabase } from '../src/lib/supabase';
import type { WorkoutDraft } from '../src/services/workout/model';

jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));
const draft: WorkoutDraft = {
  version: 1,
  clientId: 'stable-workout-key',
  startedAt: '2026-01-01T10:00:00.000Z',
  completedAt: '2026-01-01T10:30:00.000Z',
  exercises: [
    {
      exercise: {
        id: '00000000-0000-4000-8000-000000000010',
        name: 'Squat',
        category: 'Legs',
        description: '',
      },
      sets: [
        { id: 'set-1', weight: '60', reps: '10', unit: 'kg', completed: true },
        { id: 'set-2', weight: '', reps: '', unit: 'kg', completed: false },
      ],
    },
  ],
};
beforeEach(() => jest.clearAllMocks());
test('finish uses a single RPC with expected account and stable request identity', async () => {
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValue({ data: 'saved-id', error: null } as never);
  expect(await workoutService.finish('user-1', draft)).toBe('saved-id');
  await workoutService.finish('user-1', draft);
  expect(supabase!.rpc).toHaveBeenNthCalledWith(1, 'finish_workout', {
    p_user_id: 'user-1',
    p_client_id: draft.clientId,
    p_started_at: draft.startedAt,
    p_completed_at: draft.completedAt,
    p_exercises: [
      {
        exercise_id: draft.exercises[0].exercise.id,
        sets: [{ weight: 60, reps: 10, weight_unit: 'kg' }],
      },
    ],
  });
  expect(jest.mocked(supabase!.rpc).mock.calls[1]).toEqual(
    jest.mocked(supabase!.rpc).mock.calls[0],
  );
  expect(supabase!.from).not.toHaveBeenCalled();
});
test('unfinished drafts never call the backend and backend failures surface', async () => {
  await expect(
    workoutService.finish('user-1', { ...draft, completedAt: null }),
  ).rejects.toThrow('Finish time');
  expect(supabase!.rpc).not.toHaveBeenCalled();
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValue({ data: null, error: { code: '42501' } } as never);
  await expect(workoutService.finish('user-1', draft)).rejects.toEqual({
    code: '42501',
  });
});
test('history is paginated, scoped to the account, completed-only, and cancellable', async () => {
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    abortSignal: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  jest.mocked(supabase!.from).mockReturnValue(builder as never);
  const signal = new AbortController().signal;
  expect(await workoutService.history('user-1', 1, signal)).toEqual([]);
  expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  expect(builder.not).toHaveBeenCalledWith('completed_at', 'is', null);
  expect(builder.range).toHaveBeenCalledWith(20, 39);
  expect(builder.abortSignal).toHaveBeenCalledWith(signal);
});
