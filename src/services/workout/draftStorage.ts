import { secureStorage } from '../../lib/secureStorage';
import { recoveryStorageKey } from '../../lib/supabase';
import { draftSchema, type WorkoutDraft } from './model';

const queues = new Map<string, Promise<void>>();
export function draftKey(userId: string) {
  return `workout.v1.${recoveryStorageKey}.${userId}`;
}
function enqueue(key: string, task: () => Promise<void>) {
  const pending = (queues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(task);
  queues.set(key, pending);
  pending
    .finally(() => {
      if (queues.get(key) === pending) queues.delete(key);
    })
    .catch(() => {});
  return pending;
}
export const draftStorage = {
  async read(userId: string) {
    const key = draftKey(userId);
    await queues.get(key)?.catch(() => {});
    const value = await secureStorage.getItem(key);
    return value ? draftSchema.parse(JSON.parse(value)) : null;
  },
  write(userId: string, draft: WorkoutDraft) {
    const value = JSON.stringify(draftSchema.parse(draft));
    return enqueue(draftKey(userId), () =>
      secureStorage.setItem(draftKey(userId), value),
    );
  },
  remove(userId: string) {
    return enqueue(draftKey(userId), () =>
      secureStorage.removeItem(draftKey(userId)),
    );
  },
};
