import { draftKey, draftStorage } from '../src/services/workout/draftStorage';
import { secureStorage } from '../src/lib/secureStorage';
import type { WorkoutDraft } from '../src/services/workout/model';

jest.mock('../src/lib/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
const draft: WorkoutDraft = {
  version: 1,
  clientId: 'workout-123',
  startedAt: '2026-01-01T10:00:00.000Z',
  completedAt: null,
  exercises: [],
};
beforeEach(() => {
  jest.resetAllMocks();
});
test('namespaces by account/project and restores valid drafts', async () => {
  await draftStorage.write('user-1', draft);
  expect(secureStorage.setItem).toHaveBeenCalledWith(
    draftKey('user-1'),
    JSON.stringify(draft),
  );
  expect(draftKey('user-1')).not.toBe(draftKey('user-2'));
  jest.mocked(secureStorage.getItem).mockResolvedValue(JSON.stringify(draft));
  expect(await draftStorage.read('user-1')).toEqual(draft);
});
test('serializes writes and removal so older saves cannot resurrect a discarded draft', async () => {
  let finish!: () => void;
  jest.mocked(secureStorage.setItem).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const write = draftStorage.write('user-1', draft);
  const remove = draftStorage.remove('user-1');
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  expect(secureStorage.removeItem).not.toHaveBeenCalled();
  finish();
  await write;
  await remove;
  expect(secureStorage.removeItem).toHaveBeenCalledWith(draftKey('user-1'));
});
test('failed storage writes surface but do not poison subsequent retries', async () => {
  jest.mocked(secureStorage.setItem).mockRejectedValueOnce(new Error('locked'));
  await expect(draftStorage.write('user-1', draft)).rejects.toThrow('locked');
  await expect(draftStorage.write('user-1', draft)).resolves.toBeUndefined();
});
test('corrupt draft is not silently overwritten or discarded', async () => {
  jest.mocked(secureStorage.getItem).mockResolvedValue('{broken');
  await expect(draftStorage.read('user-1')).rejects.toThrow();
  expect(secureStorage.removeItem).not.toHaveBeenCalled();
  expect(secureStorage.setItem).not.toHaveBeenCalled();
});
