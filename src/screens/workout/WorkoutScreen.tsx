import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import { useAuth } from '../../services/auth/AuthProvider';
import { useProfile } from '../../services/profile/useProfile';
import { useWorkoutDraft } from '../../services/workout/useWorkoutDraft';
import {
  workoutService,
  workoutError,
  historyPageSize,
} from '../../services/workout/workoutService';
import {
  completedExercises,
  newSet,
  type Exercise,
} from '../../services/workout/model';
import {
  ExercisePicker,
  ActiveExercise,
  WorkoutClock,
  WorkoutStats,
  WorkoutDetails,
  workoutStyles,
} from './WorkoutParts';
import type { MainTabParamList } from '../../navigation/types';

type Props = BottomTabScreenProps<MainTabParamList, 'Workout'>;
type ViewName = 'hub' | 'picker' | 'active' | 'history' | 'detail';

export function WorkoutScreen(props: Props) {
  const { session } = useAuth();
  return session ? (
    <WorkoutArea key={session.user.id} {...props} userId={session.user.id} />
  ) : null;
}
function WorkoutArea({
  userId,
  navigation,
  route,
}: Props & { userId: string }) {
  const store = useWorkoutDraft(userId);
  const profile = useProfile(userId);
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewName>('hub');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draft = store.draft;
  const history = useInfiniteQuery({
    queryKey: ['workouts', userId, 'history'],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      workoutService.history(userId, pageParam, signal),
    getNextPageParam: (page, pages) =>
      page.length === historyPageSize ? pages.length : undefined,
    enabled: view === 'history',
  });
  const detail = useQuery({
    queryKey: ['workouts', userId, 'detail', detailId],
    queryFn: ({ signal }) => workoutService.detail(userId, detailId!, signal),
    enabled: view === 'detail' && Boolean(detailId),
  });
  async function begin() {
    if (lock.current) return;
    if (store.getCurrent()) {
      setView('active');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await store.start();
      if (mounted.current) setView('picker');
    } catch {
      if (mounted.current)
        setError(
          'Your draft could not be saved on this device. Retry local save before continuing.',
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (route.params?.start && !store.loading && !store.loadError) {
      navigation.setParams({ start: false });
      begin();
    }
  });
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (busy) return true;
          if (view !== 'hub') {
            setView(view === 'picker' ? 'active' : 'hub');
            return true;
          }
          return false;
        },
      );
      return () => subscription.remove();
    }, [view, busy]),
  );

  function add(exercise: Exercise) {
    store.edit(value =>
      value.exercises.length >= 30 ||
      value.exercises.some(item => item.exercise.id === exercise.id)
        ? value
        : {
            ...value,
            exercises: [
              ...value.exercises,
              { exercise, sets: [newSet(profile.data?.weight_unit ?? 'kg')] },
            ],
          },
    );
  }
  async function finish() {
    if (lock.current) return;
    const current = store.getCurrent();
    if (!current) return;
    try {
      completedExercises(current);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Complete a set first.',
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      // Freeze payload and persist before sending. A timeout retries the same ID
      // and payload, including after a process restart; editing is now locked.
      const frozen = {
        ...current,
        completedAt: current.completedAt ?? new Date().toISOString(),
      };
      await store.persist(frozen);
      const id = await workoutService.finish(userId, frozen);
      // Do not discard a locally pending request until the server acknowledged it.
      await store.clear();
      queryClient.invalidateQueries({ queryKey: ['home', userId] });
      queryClient.invalidateQueries({ queryKey: ['workouts', userId] });
      queryClient.invalidateQueries({ queryKey: ['progress', userId] });
      if (mounted.current) {
        setDetailId(id);
        setView('detail');
      }
    } catch (cause) {
      if (mounted.current) setError(workoutError(cause));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function confirmFinish() {
    setError(null);
    if (draft?.completedAt) {
      finish();
      return;
    }
    try {
      if (draft) completedExercises(draft);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Complete a set first.',
      );
      return;
    }
    Alert.alert(
      'Finish workout?',
      'Only sets marked complete will be saved. Unfinished sets are excluded. You cannot edit this session after finishing.',
      [
        { text: 'Keep training', style: 'cancel' },
        { text: 'Finish and save', onPress: finish },
      ],
    );
  }
  function discard() {
    Alert.alert(
      'Discard workout?',
      'This permanently removes the unfinished workout from this device. Completed history is not affected.',
      [
        { text: 'Keep workout', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            try {
              await store.clear();
              if (mounted.current) {
                setView('hub');
                setError(null);
              }
            } catch {
              if (mounted.current)
                setError('The draft could not be removed. Please try again.');
            } finally {
              lock.current = false;
              if (mounted.current) setBusy(false);
            }
          },
        },
      ],
    );
  }
  const disabled = busy || Boolean(draft?.completedAt);
  return (
    <KeyboardAvoidingView
      style={workoutStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <AppText variant="eyebrow" tone="accent">
          ONE SESSION AT A TIME
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {view === 'picker'
            ? 'Choose exercises'
            : view === 'active'
            ? 'Active workout'
            : view === 'history'
            ? 'Workout history'
            : view === 'detail'
            ? 'Workout complete'
            : 'Workout'}
        </AppText>
        {error && (
          <AppText accessibilityRole="alert" tone="error">
            {error}
          </AppText>
        )}
        {store.loading ? (
          <LoadingState label="Restoring your workout…" />
        ) : store.loadError ? (
          <ErrorState
            description="Your saved draft could not be read. Unlock your device and retry. It has not been overwritten."
            action={{ label: 'Retry draft', onPress: store.retryLoad }}
          />
        ) : (
          <>
            {store.storageError && (
              <ErrorState
                description="Latest changes aren’t saved on this device. Keep the app open and retry."
                action={{
                  label: 'Retry local save',
                  onPress: () => store.retrySave().catch(() => {}),
                }}
              />
            )}
            {draft && (
              <AppText variant="caption" tone="secondary">
                {store.saving
                  ? 'Saving draft on this device…'
                  : store.storageError
                  ? 'Draft has unsaved changes'
                  : 'Draft saved on this device'}
              </AppText>
            )}
            {view === 'hub' && (
              <View style={workoutStyles.section}>
                <AppText tone="secondary">
                  Choose exercises, log your sets, and build a record of your
                  effort.
                </AppText>
                <Button
                  label={draft ? 'Resume workout' : 'Start workout'}
                  onPress={begin}
                  loading={busy}
                />
                <Button
                  label="Workout history"
                  variant="secondary"
                  onPress={() => setView('history')}
                  disabled={busy}
                />
                {draft && !draft.completedAt && (
                  <Button
                    label="Discard draft"
                    variant="secondary"
                    onPress={discard}
                    disabled={busy}
                  />
                )}
              </View>
            )}
            {view === 'picker' && draft && (
              <>
                <Button
                  label="Go to active workout"
                  onPress={() => setView('active')}
                  disabled={busy}
                />
                <ExercisePicker
                  userId={userId}
                  selected={draft.exercises.map(item => item.exercise.id)}
                  add={add}
                  disabled={disabled}
                />
              </>
            )}
            {view === 'active' && draft && (
              <>
                <WorkoutClock draft={draft} />
                {draft.completedAt && (
                  <AppText tone="secondary">
                    Finish is pending. Editing is locked so a retry cannot
                    create a different or duplicate workout.
                  </AppText>
                )}
                <Button
                  label={draft.completedAt ? 'Retry finish' : 'Finish workout'}
                  loading={busy}
                  onPress={confirmFinish}
                />
                <Button
                  label="Add exercises"
                  variant="secondary"
                  disabled={disabled}
                  onPress={() => setView('picker')}
                />
                {draft.exercises.length === 0 && (
                  <EmptyState
                    title="Add your first exercise"
                    description="Then enter weight and reps and mark each finished set complete. Enter 0 weight for unweighted bodyweight sets."
                  />
                )}
                {draft.exercises.map(item => (
                  <ActiveExercise
                    key={item.exercise.id}
                    item={item}
                    userId={userId}
                    edit={store.edit}
                    disabled={disabled}
                  />
                ))}
                <Button
                  label="Save for later"
                  variant="secondary"
                  disabled={busy || store.saving || store.storageError}
                  onPress={() => setView('hub')}
                />
                {!draft.completedAt && (
                  <Button
                    label="Discard workout"
                    variant="secondary"
                    disabled={busy}
                    onPress={discard}
                  />
                )}
              </>
            )}
            {view === 'history' && (
              <>
                {history.isLoading ? (
                  <LoadingState label="Loading history…" />
                ) : history.isError ? (
                  <ErrorState
                    description={workoutError(history.error)}
                    action={{
                      label: 'Retry history',
                      onPress: () => history.refetch(),
                    }}
                  />
                ) : (
                  <>
                    {!history.data?.pages.flat().length && (
                      <EmptyState
                        title="No completed workouts yet"
                        description="Finish your first session to see it here."
                      />
                    )}
                    {history.data?.pages.flat().map(workout => (
                      <View key={workout.id} style={workoutStyles.card}>
                        <WorkoutStats workout={workout} />
                        <Button
                          label="View workout"
                          variant="secondary"
                          onPress={() => {
                            setDetailId(workout.id);
                            setView('detail');
                          }}
                        />
                      </View>
                    ))}
                    {history.hasNextPage && (
                      <Button
                        label="Load more workouts"
                        variant="secondary"
                        loading={history.isFetchingNextPage}
                        onPress={() => history.fetchNextPage()}
                      />
                    )}
                    <Button
                      label="Refresh history"
                      variant="secondary"
                      loading={history.isRefetching}
                      onPress={() => history.refetch()}
                    />
                  </>
                )}
              </>
            )}
            {view === 'detail' &&
              (detail.isLoading ? (
                <LoadingState label="Loading workout…" />
              ) : detail.isError ? (
                <ErrorState
                  description={workoutError(detail.error)}
                  action={{
                    label: 'Retry workout',
                    onPress: () => detail.refetch(),
                  }}
                />
              ) : detail.data ? (
                <>
                  <WorkoutDetails workout={detail.data} />
                  <Button
                    label="View history"
                    variant="secondary"
                    onPress={() => setView('history')}
                  />
                  <Button
                    label="Back to Home"
                    onPress={() => navigation.navigate('Home')}
                  />
                </>
              ) : null)}
            {view !== 'hub' && (
              <Button
                label="Back to workouts"
                variant="secondary"
                disabled={busy}
                onPress={() => setView('hub')}
              />
            )}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
