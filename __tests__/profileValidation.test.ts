import {
  profileStepSchema,
  goalStepSchema,
  weightStepSchema,
} from '../src/services/profile/validation';

test('name must be non-empty and under 80 characters', () => {
  expect(profileStepSchema.safeParse({ name: '' }).success).toBe(false);
  expect(profileStepSchema.safeParse({ name: '  ' }).success).toBe(false);
  expect(profileStepSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(
    false,
  );
  expect(profileStepSchema.safeParse({ name: 'Alex' }).success).toBe(true);
});

test('goal must be one of the known values', () => {
  expect(goalStepSchema.safeParse({ goal: 'build_muscle' }).success).toBe(true);
  expect(goalStepSchema.safeParse({ goal: 'fly' }).success).toBe(false);
});

test('weight is optional but must be a valid positive number when present', () => {
  expect(
    weightStepSchema.safeParse({ weightValue: '', unit: 'kg' }).success,
  ).toBe(true);
  expect(
    weightStepSchema.safeParse({ weightValue: '70.5', unit: 'kg' }).success,
  ).toBe(true);
  expect(
    weightStepSchema.safeParse({ weightValue: '0', unit: 'kg' }).success,
  ).toBe(false);
  expect(
    weightStepSchema.safeParse({ weightValue: '-5', unit: 'kg' }).success,
  ).toBe(false);
  expect(
    weightStepSchema.safeParse({ weightValue: 'abc', unit: 'kg' }).success,
  ).toBe(false);
  expect(
    weightStepSchema.safeParse({ weightValue: '9999', unit: 'kg' }).success,
  ).toBe(false);
});
