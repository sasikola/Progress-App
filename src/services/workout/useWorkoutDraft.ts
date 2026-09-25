import { useCallback, useEffect, useRef, useState } from 'react';
import { draftStorage } from './draftStorage';
import { localId, type WorkoutDraft } from './model';

export function useWorkoutDraft(userId: string) {
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = useRef<WorkoutDraft | null>(null);
  const active = useRef(true);
  const revision = useRef(0);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    draftStorage
      .read(userId)
      .then(value => {
        if (!cancelled) {
          current.current = value;
          setDraft(value);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [userId, attempt]);
  const persist = useCallback(
    async (next: WorkoutDraft) => {
      const version = ++revision.current;
      current.current = next;
      setDraft(next);
      setSaving(true);
      try {
        await draftStorage.write(userId, next);
        if (active.current && revision.current === version)
          setStorageError(false);
      } catch (error) {
        if (active.current && revision.current === version)
          setStorageError(true);
        throw error;
      } finally {
        if (active.current && revision.current === version) setSaving(false);
      }
    },
    [userId],
  );
  const edit = (change: (value: WorkoutDraft) => WorkoutDraft) => {
    if (!current.current || current.current.completedAt) return;
    persist(change(current.current)).catch(() => {});
  };
  async function clear() {
    await draftStorage.remove(userId);
    current.current = null;
    if (active.current) {
      setDraft(null);
      setStorageError(false);
      setLoadError(false);
    }
  }
  async function start() {
    if (current.current) return;
    await persist({
      version: 1,
      clientId: localId(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      exercises: [],
    });
  }
  return {
    draft,
    loading,
    loadError,
    storageError,
    saving,
    edit,
    persist,
    clear,
    start,
    retryLoad: () => setAttempt(value => value + 1),
    retrySave: () =>
      current.current ? persist(current.current) : Promise.resolve(),
    getCurrent: () => current.current,
  };
}
