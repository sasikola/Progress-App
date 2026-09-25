import {
  chartData,
  changeLabel,
  convert,
  localDay,
  parseEntry,
  type ProgressEntry,
} from '../src/services/progress/model';

const now = new Date(2026, 8, 25, 15);
const entry = (
  value: number,
  unit: ProgressEntry['unit'],
  recorded_at = '2026-09-25T12:00:00Z',
): ProgressEntry => ({ id: String(value), value, unit, recorded_at });
test('parses local dates, decimal comma and today without inventing a future time', () => {
  expect(
    parseEntry('weight', ' 70,5 ', 'kg', localDay(now), now),
  ).toMatchObject({ value: 70.5, recordedAt: now.toISOString() });
  const historical = parseEntry('waist', '30', 'in', '2026-09-01', now);
  expect(new Date(historical.recordedAt).getHours()).toBe(12);
});
test.each(['', 'abc', '-5', '0', '1000', 'Infinity', '2e2', '70.2.2'])(
  'rejects invalid number %s',
  value => {
    expect(() =>
      parseEntry('weight', value, 'kg', localDay(now), now),
    ).toThrow();
  },
);
test.each([
  '2026-02-30',
  '2026-13-01',
  '2026-09-26',
  '25/09/2026',
  '1899-01-01',
])('rejects invalid or future date %s', day => {
  expect(() => parseEntry('waist', '80', 'cm', day, now)).toThrow();
});
test('normalizes weight and measurement units; refuses incompatible units', () => {
  expect(convert(220.46226218, 'lb', 'kg')).toBeCloseTo(100);
  expect(convert(2.54, 'cm', 'in')).toBeCloseTo(1);
  expect(convert(10, 'in', 'cm')).toBeCloseTo(25.4);
  expect(() => convert(1, 'kg', 'cm')).toThrow();
  expect(() => parseEntry('weight', '70', 'cm', localDay(now), now)).toThrow();
  expect(() => parseEntry('waist', '400', 'in', localDay(now), now)).toThrow();
});
test('compares mixed units neutrally without rounding artifacts', () => {
  expect(changeLabel([entry(100, 'kg'), entry(220.46226218, 'lb')], 'kg')).toBe(
    '0.0 kg since the previous entry',
  );
  expect(changeLabel([entry(71, 'kg'), entry(70, 'kg')], 'kg')).toContain(
    '+1.0 kg',
  );
  expect(changeLabel([], 'kg')).toContain('second entry');
});
test('chart sorts timestamps, handles constant values and identical dates', () => {
  expect(chartData([], 'kg', 300)).toBeNull();
  const chart = chartData(
    [entry(70, 'kg'), entry(70, 'kg', '2026-09-01T12:00:00Z')],
    'kg',
    300,
  )!;
  expect(chart.points[0].x).toBe(5);
  expect(chart.points[1].x).toBe(295);
  expect(chart.points[0].y).toBe(chart.points[1].y);
  expect(
    chartData([entry(70, 'kg'), entry(71, 'kg')], 'kg', 300)!.points.every(
      point => Number.isFinite(point.x) && Number.isFinite(point.y),
    ),
  ).toBe(true);
});
test('chart bounds work to the latest 30 entries without changing input order', () => {
  const entries = Array.from({ length: 50 }, (_, index) =>
    entry(50 + index, 'kg', new Date(2026, 0, index + 1).toISOString()),
  );
  const before = [...entries];
  expect(chartData(entries, 'kg', 300)!.points).toHaveLength(30);
  expect(entries).toEqual(before);
});
