import { z } from 'zod';

export const measurementOptions = [
  { value: 'chest', label: 'Chest' },
  { value: 'waist', label: 'Waist' },
  { value: 'hips', label: 'Hips' },
  { value: 'left_arm', label: 'Left arm' },
  { value: 'right_arm', label: 'Right arm' },
  { value: 'left_thigh', label: 'Left thigh' },
  { value: 'right_thigh', label: 'Right thigh' },
] as const;
export type MeasurementKind = (typeof measurementOptions)[number]['value'];
export type EntryKind = 'weight' | MeasurementKind;
export type EntryUnit = 'kg' | 'lb' | 'cm' | 'in';
export const entrySchema = z.object({
  id: z.string(),
  value: z.coerce.number().finite(),
  unit: z.enum(['kg', 'lb', 'cm', 'in']),
  recorded_at: z.string().datetime({ offset: true }),
});
export type ProgressEntry = z.infer<typeof entrySchema>;
export const recordSchema = z.object({
  exercise_id: z.string(),
  name: z.string(),
  weight: z.coerce.number().finite(),
  weight_unit: z.enum(['kg', 'lb']),
  reps: z.number().int(),
  completed_at: z.string(),
});
export const overviewSchema = z.object({
  workout_count: z.coerce.number(),
  set_count: z.coerce.number(),
  volume_kg: z.coerce.number(),
  weights: entrySchema.array(),
});
export type EntryInput = {
  kind: EntryKind;
  value: number;
  unit: EntryUnit;
  recordedAt: string;
  clientId: string;
};

export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function parseEntry(
  kind: EntryKind,
  text: string,
  unit: EntryUnit,
  day: string,
  now = new Date(),
) {
  const trimmed = text.trim();
  const value = Number(trimmed.replace(',', '.'));
  if (
    !/^\d+(?:[.,]\d+)?$/.test(trimmed) ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value >= 1000
  ) {
    throw new Error('Enter a number greater than 0 and less than 1000.');
  }
  if (!(kind === 'weight' ? ['kg', 'lb'] : ['cm', 'in']).includes(unit))
    throw new Error('Choose a valid unit.');
  if (unit === 'in' && value * 2.54 >= 1000)
    throw new Error('Measurement must be less than 1000 cm.');
  return { kind, value, unit, recordedAt: recordedAtForDay(day, now) };
}
export function recordedAtForDay(day: string, now = new Date()) {
  const date = new Date(day + 'T12:00:00');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(date.getTime()) ||
    localDay(date) !== day ||
    day < '1900-01-01' ||
    day > localDay(now)
  ) {
    throw new Error(
      'Enter a valid date from 1900 through today, using YYYY-MM-DD.',
    );
  }
  return (day === localDay(now) ? now : date).toISOString();
}
export function convert(value: number, from: EntryUnit, to: EntryUnit) {
  if (from === to) return value;
  if (from === 'kg' && to === 'lb') return value * 2.2046226218;
  if (from === 'lb' && to === 'kg') return value / 2.2046226218;
  if (from === 'cm' && to === 'in') return value / 2.54;
  if (from === 'in' && to === 'cm') return value * 2.54;
  throw new Error('Incompatible units.');
}
export function changeLabel(entries: ProgressEntry[], unit: EntryUnit) {
  if (entries.length < 2) return 'Add a second entry to see a change.';
  const difference =
    convert(entries[0].value, entries[0].unit, unit) -
    convert(entries[1].value, entries[1].unit, unit);
  const rounded = Math.round(difference * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(
    1,
  )} ${unit} since the previous entry`;
}
export function chartData(
  entries: ProgressEntry[],
  unit: EntryUnit,
  width: number,
  height = 150,
) {
  const sorted = [...entries]
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    .slice(-30);
  if (!sorted.length) return null;
  const values = sorted.map(entry => convert(entry.value, entry.unit, unit));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.1, 0.1);
  const low = minimum - padding;
  const high = maximum + padding;
  const start = Date.parse(sorted[0].recorded_at);
  const end = Date.parse(sorted[sorted.length - 1].recorded_at);
  return {
    low,
    high,
    sorted,
    points: values.map((value, index) => ({
      x:
        end === start
          ? width / 2
          : 5 +
            ((Date.parse(sorted[index].recorded_at) - start) / (end - start)) *
              Math.max(0, width - 10),
      y: 5 + ((high - value) / (high - low)) * (height - 10),
    })),
  };
}

export function progressError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : '';
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code))
    return 'Progress setup is needed. Apply the Phase 5 SQL migration in Supabase, then retry.';
  if (code === '42501')
    return 'Access denied. Check that you are signed in to the correct account.';
  return 'Could not complete the request. Check your connection and retry. Unsaved input stays here while this form is open.';
}
