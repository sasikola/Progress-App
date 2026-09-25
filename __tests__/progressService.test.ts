import { supabase } from '../src/lib/supabase';
import { progressService } from '../src/services/progress/progressService';
jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = jest.mocked(supabase!.rpc);
const signal = new AbortController().signal;
const rows = Array.from({ length: 21 }, (_, index) => ({
  id: String(index),
  value: 70,
  unit: 'kg',
  recorded_at: '2026-09-25T12:00:00+00:00',
}));
let abortSignal: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  abortSignal = jest.fn().mockResolvedValue({ data: rows, error: null });
  rpc.mockReturnValue({ abortSignal } as never);
});
test('uses a bounded cursor request, retains timestamp precision and omits lookahead row', async () => {
  const page = await progressService.history('weight', null, signal);
  expect(page.entries).toHaveLength(20);
  expect(page.next).toEqual(rows[19]);
  expect(rpc).toHaveBeenCalledWith('progress_history', {
    p_kind: 'weight',
    p_before_at: null,
    p_before_id: null,
    p_limit: 21,
  });
  await progressService.history('weight', page.next, signal);
  expect(rpc).toHaveBeenLastCalledWith(
    'progress_history',
    expect.objectContaining({
      p_before_at: rows[19].recorded_at,
      p_before_id: '19',
    }),
  );
  expect(abortSignal).toHaveBeenCalledWith(signal);
});
test('empty history has no next page; schema errors are not treated as empty data', async () => {
  abortSignal.mockResolvedValueOnce({ data: [], error: null });
  expect(
    (await progressService.history('waist', null, signal)).next,
  ).toBeNull();
  const error = { code: 'PGRST202' };
  abortSignal.mockResolvedValueOnce({ data: null, error });
  await expect(progressService.overview(signal)).rejects.toEqual(error);
});
test('sends owner and stable request ID for retry-safe entry saves', async () => {
  rpc.mockResolvedValue({ data: 'entry-id', error: null } as never);
  const input = {
    clientId: 'stable-request-id',
    kind: 'weight' as const,
    value: 70,
    unit: 'kg' as const,
    recordedAt: rows[0].recorded_at,
  };
  await progressService.save('user-1', input);
  await progressService.save('user-1', input);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(rpc).toHaveBeenCalledWith(
    'log_progress_entry',
    expect.objectContaining({
      p_user_id: 'user-1',
      p_client_id: 'stable-request-id',
      p_value: 70,
    }),
  );
});
