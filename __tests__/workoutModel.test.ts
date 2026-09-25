import {
  completedExercises,
  draftSchema,
  durationLabel,
  elapsedSeconds,
  newSet,
  parseSet,
  type WorkoutDraft,
} from '../src/services/workout/model';

export const fixtureDraft: WorkoutDraft = {
  version: 1,
  clientId: 'test-workout-123',
  startedAt: '2026-01-01T10:00:00.000Z',
  completedAt: null,
  exercises: [
    {
      exercise: {
        id: '00000000-0000-4000-8000-000000000010',
        name: 'Squat',
        category: 'Legs',
        description: 'Total barbell load',
      },
      sets: [
        { id: 'set-1', weight: '60', reps: '10', unit: 'kg', completed: true },
      ],
    },
  ],
};
test('validates completed sets, including bodyweight and decimal commas', () => {
  expect(parseSet({ ...newSet(), weight: '0', reps: '5' })).toEqual({
    weight: 0,
    reps: 5,
    weight_unit: 'kg',
  });
  expect(parseSet({ ...newSet('lb'), weight: '12,5', reps: '8' }).weight).toBe(
    12.5,
  );
});
test.each([
  ['', '10'],
  ['60', ''],
  ['-1', '10'],
  ['1e2', '10'],
  ['60', '1.5'],
  ['2001', '10'],
  ['1', '0'],
  ['1', '1001'],
  ['NaN', '10'],
])('rejects invalid weight/reps %s / %s', (weight, reps) => {
  expect(() => parseSet({ ...newSet(), weight, reps })).toThrow();
});
test('only completed sets are included; no completed sets is rejected', () => {
  const draft: WorkoutDraft = JSON.parse(JSON.stringify(fixtureDraft));
  draft.exercises[0].sets.push(newSet());
  expect(completedExercises(draft)).toEqual([
    {
      exercise_id: draft.exercises[0].exercise.id,
      sets: [{ weight: 60, reps: 10, weight_unit: 'kg' }],
    },
  ]);
  draft.exercises[0].sets[0].completed = false;
  expect(() => completedExercises(draft)).toThrow('Complete at least one set');
});
test('draft schema rejects incompatible storage and timer uses absolute times', () => {
  expect(draftSchema.safeParse({ ...fixtureDraft, version: 2 }).success).toBe(
    false,
  );
  expect(
    elapsedSeconds(fixtureDraft.startedAt, '2026-01-01T11:01:05.000Z'),
  ).toBe(3665);
  expect(durationLabel(3665)).toBe('1h 1m');
  expect(durationLabel(null)).toBe('Duration not recorded');
  expect(
    elapsedSeconds(fixtureDraft.startedAt, '2025-01-01T00:00:00.000Z'),
  ).toBe(0);
});
