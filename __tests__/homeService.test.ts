import {
  homeService,
  weightChange,
  type WeightEntry,
} from '../src/services/home/homeService';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const signal = new AbortController().signal;
function query(result: unknown) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    abortSignal: jest.fn().mockResolvedValue(result),
  };
  jest.mocked(supabase!.from).mockReturnValue(builder as never);
  return builder;
}
test('weights are scoped, ordered newest first, limited and cancellable', async () => {
  const builder = query({ data: [], error: null });
  expect(await homeService.getWeights('user-1', signal)).toEqual([]);
  expect(supabase!.from).toHaveBeenCalledWith('weight_entries');
  expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  expect(builder.order).toHaveBeenCalledWith('recorded_at', {
    ascending: false,
  });
  expect(builder.limit).toHaveBeenCalledWith(2);
  expect(builder.abortSignal).toHaveBeenCalledWith(signal);
});
test('recent workout excludes unfinished sessions and returns the latest', async () => {
  const workout = { id: 'workout-1', duration_seconds: 1800 };
  const builder = query({ data: [workout], error: null });
  expect(await homeService.getRecentWorkout('user-2', signal)).toEqual({
    available: true,
    workout,
  });
  expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-2');
  expect(builder.not).toHaveBeenCalledWith('completed_at', 'is', null);
  expect(builder.order).toHaveBeenCalledWith('completed_at', {
    ascending: false,
  });
  expect(builder.limit).toHaveBeenCalledWith(1);
});
test.each(['42P01', 'PGRST205'])(
  'missing workouts table (%s) is an explicit unavailable state',
  async code => {
    query({ data: null, error: { code } });
    expect(await homeService.getRecentWorkout('user-1', signal)).toEqual({
      available: false,
      workout: null,
    });
  },
);
test.each(['42501', 'PGRST204', 'network_error'])(
  'other workout failures (%s) remain errors',
  async code => {
    query({ data: null, error: { code } });
    await expect(
      homeService.getRecentWorkout('user-1', signal),
    ).rejects.toEqual({ code });
  },
);
test('missing weight table is an error, not empty history', async () => {
  query({ data: null, error: { code: '42P01' } });
  await expect(homeService.getWeights('user-1', signal)).rejects.toEqual({
    code: '42P01',
  });
});
const entry = (weight: number, unit: 'kg' | 'lb'): WeightEntry => ({
  id: '1',
  weight,
  unit,
  recorded_at: '2026-09-23T00:00:00Z',
});
test('weight highlights need two entries and respect mixed units', () => {
  expect(weightChange([])).toBeNull();
  expect(weightChange([entry(70, 'kg')])).toBeNull();
  expect(weightChange([entry(70, 'kg'), entry(72, 'kg')])).toEqual({
    value: -2,
    unit: 'kg',
  });
  expect(
    weightChange([entry(70, 'kg'), entry(154.323583526, 'lb')])?.value,
  ).toBeCloseTo(0);
  expect(weightChange([entry(156, 'lb'), entry(70, 'kg')])).toEqual({
    value: 1.7,
    unit: 'lb',
  });
});
