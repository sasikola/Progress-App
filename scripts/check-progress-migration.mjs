import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL: never accesses the live Supabase project.
const files = [
  '202609230001_phase4_workouts.sql',
  '202609250001_profile_compatibility.sql',
  '202609250002_phase5_progress.sql',
];
const migrations = await Promise.all(
  files.map(file =>
    readFile(
      new URL('../supabase/migrations/' + file, import.meta.url),
      'utf8',
    ),
  ),
);
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
for (const scenario of ['fresh', 'existing-measurements']) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      insert into auth.users values ('${user1}'), ('${user2}');
    `);
    await db.exec(migrations[0]);
    await db.exec(migrations[1]);
    await db.exec(
      `insert into public.weight_entries(user_id, weight, unit, recorded_at) values ('${user1}', 70, 'kg', '2020-01-01');`,
    );
    if (scenario === 'existing-measurements') {
      await db.exec(`create table public.measurements (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
        measurement_type text not null, value numeric not null, unit text not null,
        recorded_at timestamptz not null default now(), created_at timestamptz not null default now());
        insert into public.measurements(user_id, measurement_type, value, unit, recorded_at)
          values ('${user1}', 'chest', 90, 'cm', '2020-01-01');
        create policy old_broad_read on public.measurements for select to authenticated using (true);`);
    }
    const weightsBefore = (
      await db.query(
        'select id, user_id, weight, unit, recorded_at, created_at from public.weight_entries',
      )
    ).rows;
    await db.exec(migrations[2]);
    await db.exec(migrations[2]);
    assert.deepEqual(
      (
        await db.query(
          'select id, user_id, weight, unit, recorded_at, created_at from public.weight_entries',
        )
      ).rows,
      weightsBefore,
    );
    const measurementsBefore = (
      await db.query('select * from public.measurements')
    ).rows;
    if (scenario === 'existing-measurements')
      assert.equal(Number(measurementsBefore[0].value), 90);
    await db.exec('set role authenticated');
    const signIn = id =>
      db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await signIn(user1);
    const save = (
      id,
      token,
      kind,
      value,
      unit,
      date = '2020-01-02T12:00:00Z',
    ) =>
      db.query(
        'select public.log_progress_entry($1::uuid, $2, $3, $4::numeric, $5, $6::timestamptz) as id',
        [id, token, kind, value, unit, date],
      );
    const history = (kind, cursor = null, limit = 21) =>
      db.query(
        'select * from public.progress_history($1, $2::timestamptz, $3::uuid, $4)',
        [kind, cursor?.recorded_at ?? null, cursor?.id ?? null, limit],
      );
    const saved = (await save(user1, 'weight-request-001', 'weight', 154, 'lb'))
      .rows[0].id;
    assert.equal(
      (await save(user1, 'weight-request-001', 'weight', 154, 'lb')).rows[0].id,
      saved,
    );
    assert.equal((await history('weight')).rows.length, 2);
    for (const [kind, unit] of [
      ['chest', 'cm'],
      ['waist', 'in'],
      ['hips', 'cm'],
      ['left_arm', 'cm'],
      ['right_arm', 'cm'],
      ['left_thigh', 'cm'],
      ['right_thigh', 'cm'],
    ]) {
      await save(user1, 'entry-for-' + kind, kind, 30, unit);
      assert.equal((await history(kind)).rows[0].unit, unit);
    }
    for (const args of [
      [user2, 'wrong-owner', 'weight', 80, 'kg'],
      [user1, 'invalid-kind', 'elbow', 80, 'cm'],
      [user1, 'invalid-unit', 'weight', 80, 'cm'],
      [user1, 'invalid-value', 'weight', 0, 'kg'],
      [user1, 'invalid-inches', 'waist', 400, 'in'],
      [user1, 'invalid-nan', 'weight', 'NaN', 'kg'],
      [user1, 'invalid-date', 'weight', 80, 'kg', 'infinity'],
      [
        user1,
        'future-date',
        'weight',
        80,
        'kg',
        new Date(Date.now() + 86400000).toISOString(),
      ],
    ])
      await assert.rejects(save(...args));
    for (let i = 0; i < 24; i++)
      await save(user1, 'pagination-' + i, 'weight', 70 + i / 10, 'kg');
    const first = (await history('weight', null, 20)).rows;
    assert.equal(first.length, 20);
    // Insert after page one: it must not shift or duplicate entries in page two.
    await save(
      user1,
      'newer-after-page-one',
      'weight',
      75,
      'kg',
      '2020-01-03T12:00:00Z',
    );
    const second = (await history('weight', first.at(-1), 20)).rows;
    assert.equal(second.length, 6);
    assert.equal(new Set([...first, ...second].map(row => row.id)).size, 26);
    await assert.rejects(
      db.query(
        "select * from public.progress_history('weight', '2020-01-02', null)",
      ),
    );
    const exerciseId = (
      await db.query(
        "select id from public.exercises where name = 'Bench Press' limit 1",
      )
    ).rows[0].id;
    const workout = (id, token, weight, unit, reps) =>
      db.query(
        "select public.finish_workout($1::uuid, $2, '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', $3::jsonb) as id",
        [
          id,
          token,
          JSON.stringify([
            {
              exercise_id: exerciseId,
              sets: [{ weight, weight_unit: unit, reps }],
            },
          ]),
        ],
      );
    await workout(user1, 'records-workout-one', 100, 'kg', 5);
    await workout(user1, 'records-workout-two', 220.46226218, 'lb', 8);
    const records = (await db.query('select * from public.progress_records()'))
      .rows;
    assert.equal(records.length, 1);
    assert.equal(records[0].reps, 8);
    assert.equal(records[0].weight_unit, 'lb');
    assert.equal(
      (await db.query('select * from public.progress_records(1, 21)')).rows
        .length,
      0,
    );
    const overview = (
      await db.query('select public.progress_overview() as data')
    ).rows[0].data;
    assert.equal(overview.workout_count, 2);
    assert.equal(overview.set_count, 2);
    assert.equal(Number(overview.volume_kg), 1300);
    assert.equal(overview.weights.length, 2);
    // An incomplete set must never become a lifting record.
    const incomplete = (
      await workout(user1, 'incomplete-heavy-set', 180, 'kg', 10)
    ).rows[0].id;
    await db.exec('reset role');
    await db.query(
      'update public.workout_sets set completed = false where workout_exercise_id in (select id from public.workout_exercises where workout_id = $1)',
      [incomplete],
    );
    await db.exec('set role authenticated');
    assert.equal(
      (await db.query('select * from public.progress_records()')).rows[0].reps,
      8,
    );
    await signIn(user2);
    assert.equal((await history('weight')).rows.length, 0);
    assert.equal((await history('chest')).rows.length, 0);
    assert.equal(
      (await db.query('select * from public.measurements')).rows.length,
      0,
    );
    assert.equal(
      (await db.query('select * from public.progress_records()')).rows.length,
      0,
    );
    assert.equal(
      (await db.query('select public.progress_overview() as data')).rows[0].data
        .workout_count,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.measurements(user_id, measurement_type, value, unit) values ($1, 'waist', 80, 'cm')",
        [user1],
      ),
      /row-level security/,
    );
    await workout(user2, 'other-user-record', 200, 'kg', 10);
    await signIn(user1);
    assert.equal(
      (await db.query('select * from public.progress_records()')).rows[0].reps,
      8,
    );
    await signIn('');
    await assert.rejects(
      save(user1, 'not-authenticated', 'weight', 70, 'kg'),
      /Account changed/,
    );
    assert.equal((await history('weight')).rows.length, 0);
    await db.exec('set role anon');
    await assert.rejects(
      db.query('select * from public.measurements'),
      /permission denied/,
    );
    await assert.rejects(history('weight'), /permission denied/);
    await assert.rejects(
      db.query('select public.progress_overview()'),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select * from public.progress_records()'),
      /permission denied/,
    );
    await assert.rejects(
      save(user1, 'anonymous-entry', 'weight', 70, 'kg'),
      /permission denied/,
    );
    await db.exec('reset role');
    const beforeRerun = (
      await db.query('select * from public.measurements order by id')
    ).rows;
    await db.exec(migrations[2]);
    assert.deepEqual(
      (await db.query('select * from public.measurements order by id')).rows,
      beforeRerun,
    );
    console.log(
      'PASS Phase 5:',
      scenario,
      'preservation, reruns, retries, units, validation, pagination, mixed-unit records, overview, RLS',
    );
  } finally {
    await db.close();
  }
}
