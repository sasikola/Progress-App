import { z } from 'zod';

export const goalOptions = [
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'get_stronger', label: 'Get stronger' },
  { value: 'improve_fitness', label: 'Improve fitness' },
  { value: 'maintain', label: 'Maintain' },
] as const;
const goalValues = goalOptions.map(option => option.value) as [
  string,
  ...string[],
];

export const weightUnits = ['kg', 'lb'] as const;
export const weightUnitOptions = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
] as const;

export const profileStepSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(80, 'Keep your name under 80 characters.'),
});

export const goalStepSchema = z.object({
  goal: z.enum(goalValues, 'Choose a goal to continue.'),
});

export const weightStepSchema = z
  .object({
    weightValue: z.string().trim(),
    unit: z.enum(weightUnits),
  })
  .refine(
    value =>
      value.weightValue === '' ||
      (!Number.isNaN(Number(value.weightValue)) &&
        Number(value.weightValue) > 0 &&
        Number(value.weightValue) < 1000),
    {
      path: ['weightValue'],
      message: 'Enter a valid weight, or leave this blank.',
    },
  );

export type Goal = (typeof goalOptions)[number]['value'];
export type WeightUnit = (typeof weightUnits)[number];
export type ProfileStepValues = z.infer<typeof profileStepSchema>;
export type GoalStepValues = z.infer<typeof goalStepSchema>;
export type WeightStepValues = z.infer<typeof weightStepSchema>;
