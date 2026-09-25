import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppText } from '../../components/common/AppText';
import { TextInput } from '../../components/inputs/TextInput';
import { Button } from '../../components/buttons/Button';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/feedback/States';
import {
  workoutService,
  workoutError,
} from '../../services/workout/workoutService';
import {
  durationLabel,
  elapsedSeconds,
  newSet,
  parseSet,
  type Exercise,
  type WorkoutDraft,
  type Workout,
  type WorkoutDetail,
} from '../../services/workout/model';
import { colors, radius, spacing } from '../../theme';

export const workoutStyles = StyleSheet.create({
  container: { flex: 1 },
  section: { gap: spacing.lg },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.secondarySurface,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  input: { flex: 1, minWidth: 110 },
});
export function WorkoutClock({ draft }: { draft: WorkoutDraft }) {
  const [now, setNow] = useState(new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <AppText variant="heading">
      {durationLabel(elapsedSeconds(draft.startedAt, draft.completedAt ?? now))}
    </AppText>
  );
}

export function ExercisePicker({
  userId,
  selected,
  add,
  disabled,
}: {
  userId: string;
  selected: string[];
  add: (exercise: Exercise) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['workouts', userId, 'catalog'],
    queryFn: ({ signal }) => workoutService.catalog(signal),
  });
  const exercises =
    query.data?.filter(item =>
      `${item.name} ${item.category}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ) ?? [];
  return (
    <View style={workoutStyles.section}>
      <TextInput
        label="Search exercises or muscle group"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />
      <AppText tone="secondary">
        {selected.length} / 30 exercises added. You can add more during your
        workout.
      </AppText>
      {query.isLoading ? (
        <LoadingState label="Loading exercises…" />
      ) : query.isError ? (
        <ErrorState
          description={workoutError(query.error)}
          action={{ label: 'Retry exercises', onPress: () => query.refetch() }}
        />
      ) : exercises.length === 0 ? (
        <EmptyState
          title="No exercises found"
          description="Try another search. If the catalog is empty, apply the Phase 4 migration."
        />
      ) : (
        exercises.map(exercise => (
          <View key={exercise.id} style={workoutStyles.card}>
            <AppText variant="heading">{exercise.name}</AppText>
            <AppText variant="caption" tone="accent">
              {exercise.category}
            </AppText>
            <AppText tone="secondary">{exercise.description}</AppText>
            <Button
              label={
                selected.includes(exercise.id)
                  ? `${exercise.name} added`
                  : `Add ${exercise.name}`
              }
              variant="secondary"
              disabled={
                disabled ||
                selected.includes(exercise.id) ||
                selected.length >= 30
              }
              onPress={() => add(exercise)}
            />
          </View>
        ))
      )}
    </View>
  );
}

export function ActiveExercise({
  item,
  userId,
  disabled,
  edit,
}: {
  item: WorkoutDraft['exercises'][number];
  userId: string;
  disabled: boolean;
  edit: (update: (draft: WorkoutDraft) => WorkoutDraft) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const previous = useQuery({
    queryKey: ['workouts', userId, 'previous', item.exercise.id],
    queryFn: ({ signal }) => workoutService.previous(item.exercise.id, signal),
  });
  const changeSets = (update: (sets: typeof item.sets) => typeof item.sets) =>
    edit(draft => ({
      ...draft,
      exercises: draft.exercises.map(value =>
        value.exercise.id === item.exercise.id
          ? { ...value, sets: update(value.sets) }
          : value,
      ),
    }));
  function removeExercise() {
    Alert.alert(
      'Remove exercise?',
      `Remove ${item.exercise.name} and its sets from this draft?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            edit(draft => ({
              ...draft,
              exercises: draft.exercises.filter(
                value => value.exercise.id !== item.exercise.id,
              ),
            })),
        },
      ],
    );
  }
  return (
    <View style={workoutStyles.card}>
      <AppText variant="heading" accessibilityRole="header">
        {item.exercise.name}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {item.exercise.description}
      </AppText>
      {previous.isLoading ? (
        <AppText tone="secondary">Loading previous performance…</AppText>
      ) : previous.isError ? (
        <ErrorState
          description="Previous performance is unavailable. You can still log sets."
          action={{
            label: 'Retry previous sets',
            onPress: () => previous.refetch(),
          }}
        />
      ) : (
        <AppText variant="caption" tone="secondary">
          {previous.data?.length
            ? `Previous session: ${previous.data
                .map(set => `${set.weight} ${set.weight_unit} × ${set.reps}`)
                .join(' · ')}`
            : 'First recorded session for this exercise.'}
        </AppText>
      )}
      {error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      {item.sets.map((set, index) => (
        <View key={set.id} style={workoutStyles.section}>
          <AppText variant="label">
            Set {index + 1}
            {set.completed ? ' · Complete ✓' : ''}
          </AppText>
          <View style={workoutStyles.row}>
            <View style={workoutStyles.input}>
              <TextInput
                label={`Set ${index + 1} weight (${set.unit})`}
                value={set.weight}
                keyboardType="decimal-pad"
                editable={!disabled}
                onChangeText={weight =>
                  changeSets(sets =>
                    sets.map(value =>
                      value.id === set.id
                        ? { ...value, weight, completed: false }
                        : value,
                    ),
                  )
                }
              />
            </View>
            <View style={workoutStyles.input}>
              <TextInput
                label={`Set ${index + 1} reps`}
                value={set.reps}
                keyboardType="number-pad"
                editable={!disabled}
                onChangeText={reps =>
                  changeSets(sets =>
                    sets.map(value =>
                      value.id === set.id
                        ? { ...value, reps, completed: false }
                        : value,
                    ),
                  )
                }
              />
            </View>
          </View>
          <Button
            label={`Unit: ${set.unit} — switch to ${
              set.unit === 'kg' ? 'lb' : 'kg'
            }`}
            variant="secondary"
            disabled={disabled}
            onPress={() =>
              changeSets(sets =>
                sets.map(value =>
                  value.id === set.id
                    ? {
                        ...value,
                        unit: value.unit === 'kg' ? 'lb' : 'kg',
                        weight: '',
                        completed: false,
                      }
                    : value,
                ),
              )
            }
          />
          <Button
            label={
              set.completed
                ? `Undo set ${index + 1}`
                : `Complete set ${index + 1}`
            }
            disabled={disabled}
            variant={set.completed ? 'secondary' : 'primary'}
            onPress={() => {
              try {
                if (!set.completed) parseSet(set);
                setError(null);
                changeSets(sets =>
                  sets.map(value =>
                    value.id === set.id
                      ? { ...value, completed: !value.completed }
                      : value,
                  ),
                );
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : 'Check this set.',
                );
              }
            }}
          />
          <Button
            label={`Delete set ${index + 1}`}
            variant="secondary"
            disabled={disabled}
            onPress={() =>
              Alert.alert(
                'Delete set?',
                'This removes the set from your draft.',
                [
                  { text: 'Keep', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () =>
                      changeSets(sets =>
                        sets.filter(value => value.id !== set.id),
                      ),
                  },
                ],
              )
            }
          />
        </View>
      ))}
      <Button
        label="Add set"
        variant="secondary"
        disabled={disabled || item.sets.length >= 20}
        onPress={() =>
          changeSets(sets =>
            sets.length >= 20
              ? sets
              : [...sets, newSet(sets[sets.length - 1]?.unit ?? 'kg')],
          )
        }
      />
      <Button
        label="Remove exercise"
        variant="secondary"
        disabled={disabled}
        onPress={removeExercise}
      />
    </View>
  );
}

export function WorkoutStats({ workout }: { workout: Workout }) {
  return (
    <View style={workoutStyles.section}>
      <AppText variant="heading">
        {new Date(workout.completed_at).toLocaleString()}
      </AppText>
      <AppText>
        {durationLabel(workout.duration_seconds)} · {workout.exercise_count}{' '}
        exercises · {workout.set_count} sets
      </AppText>
      <AppText tone="secondary">
        External-load volume: {Number(workout.volume_kg).toLocaleString()}{' '}
        kg·reps
      </AppText>
    </View>
  );
}
export function WorkoutDetails({ workout }: { workout: WorkoutDetail }) {
  return (
    <View style={workoutStyles.section}>
      <WorkoutStats workout={workout} />
      <AppText tone="secondary">
        Completed sets only. Bodyweight itself is not included in volume; lb
        loads are converted to kg.
      </AppText>
      {workout.records.length ? (
        workout.records.map(record => (
          <View key={record.exercise_id} style={workoutStyles.card}>
            <AppText variant="label" tone="accent">
              New load record · {record.name}
            </AppText>
            <AppText>
              {record.weight_kg} kg (previous best {record.previous_best_kg} kg)
            </AppText>
          </View>
        ))
      ) : (
        <AppText tone="secondary">
          No new load records. First sessions establish your baseline.
        </AppText>
      )}
      {[...workout.workout_exercises]
        .sort((a, b) => a.order_index - b.order_index)
        .map(item => (
          <View key={item.id} style={workoutStyles.card}>
            <AppText variant="heading">{item.exercises.name}</AppText>
            {[...item.workout_sets]
              .sort((a, b) => a.set_number - b.set_number)
              .map(set => (
                <AppText key={set.id}>
                  Set {set.set_number} · {set.weight} {set.weight_unit} ×{' '}
                  {set.reps} reps
                </AppText>
              ))}
          </View>
        ))}
    </View>
  );
}
