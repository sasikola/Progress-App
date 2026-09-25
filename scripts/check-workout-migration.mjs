import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// An isolated in-memory PostgreSQL database; never connects to the real project.
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
const legacyUser = '00000000-0000-4000-8000-000000000003';
const legacySetup = await readFile(
  new URL('./fixtures/phase4-legacy-schema.sql', import.meta.url),
  'utf8',
);
for (const scenario of ['fresh', 'legacy', 'legacy-before-category-fix']) {
  const db = new PGlite();
  let owner = user1;
  try {
    await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${user1}'), ('${user2}'), ('${legacyUser}');
  `);
    const legacy = scenario !== 'fresh';
    if (legacy) {
      await db.exec(legacySetup);
      if (scenario === 'legacy-before-category-fix')
        await db.exec('alter table public.exercises drop column category');
    }
    const preservedExercises = legacy
      ? (
          await db.query(
            'select id, name, muscle_group, equipment, is_default, created_at from public.exercises order by id',
          )
        ).rows
      : [];
    const preservedWorkouts = legacy
      ? (
          await db.query(
            'select id, user_id, name, started_at, completed_at, notes, created_at from public.workouts order by id',
          )
        ).rows
      : [];
    const preservedLinks = legacy
      ? (await db.query('select * from public.workout_exercises order by id'))
          .rows
      : [];
    const migration = await readFile(
      new URL(
        '../supabase/migrations/202609230001_phase4_workouts.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration); // Repeat deployment must retain existing catalog/data.
    assert.equal(
      (await db.query('select count(*)::int as count from public.exercises'))
        .rows[0].count,
      legacy ? 12 : 10,
    );
    if (legacy) {
      assert.deepEqual(
        (
          await db.query(
            'select id, name, muscle_group, equipment, is_default, created_at from public.exercises where muscle_group is not null order by id',
          )
        ).rows,
        preservedExercises,
      );
      assert.deepEqual(
        (
          await db.query(
            'select id, user_id, name, started_at, completed_at, notes, created_at from public.workouts order by id',
          )
        ).rows,
        preservedWorkouts,
      );
      assert.deepEqual(
        (await db.query('select * from public.workout_exercises order by id'))
          .rows,
        preservedLinks,
      );
      const existing = (
        await db.query(
          "select * from public.exercises where name = 'Legacy Row' order by id",
        )
      ).rows;
      assert.equal(
        existing.length,
        2,
        'Preserve duplicate exercise names and their distinct IDs',
      );
      assert.equal(existing[0].category, 'Back');
      assert.equal(existing[0].description, '');
      const oldWorkouts = (
        await db.query('select * from public.workouts order by id')
      ).rows;
      assert.equal(oldWorkouts[0].name, 'Original session name');
      assert.equal(oldWorkouts[0].duration_seconds, 1800);
      assert.equal(oldWorkouts[0].exercise_count, 1);
      assert.equal(
        oldWorkouts[0].set_count,
        0,
        'Do not invent missing set records',
      );
      assert.equal(oldWorkouts[0].client_id, `legacy-${oldWorkouts[0].id}`);
      assert.equal(
        oldWorkouts[1].completed_at,
        null,
        'Do not mark old unfinished sessions complete',
      );
      assert.equal(oldWorkouts[1].duration_seconds, null);
      assert.equal(
        oldWorkouts[2].duration_seconds,
        null,
        'Do not invent durations for invalid historical timestamps',
      );
    }
    const exercise = (
      await db.query(
        "select id from public.exercises where name = 'Bench Press'",
      )
    ).rows[0].id;
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      user1,
    ]);
    const payload = weight => [
      {
        exercise_id: exercise,
        sets: [{ weight, weight_unit: 'kg', reps: 10 }],
      },
    ];
    async function finish(
      key,
      exercises,
      start = '2026-01-01T10:00:00Z',
      end = '2026-01-01T10:30:00Z',
    ) {
      const result = await db.query(
        'select public.finish_workout($1, $2, $3, $4, $5::jsonb) as id',
        [owner, key, start, end, JSON.stringify(exercises)],
      );
      return result.rows[0].id;
    }
    const first = await finish('first-workout-key', payload(60));
    assert.equal(
      await finish('first-workout-key', payload(60)),
      first,
      'Retries must return the original workout',
    );
    let rows = (await db.query('select * from public.workouts')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].duration_seconds, 1800);
    assert.equal(rows[0].set_count, 1);
    assert.equal(Number(rows[0].volume_kg), 600);
    assert.deepEqual(rows[0].records, []);
    assert.equal(
      rows[0].name,
      'Workout',
      'New saves must satisfy legacy name NOT NULL',
    );

    const second = await finish(
      'second-workout-key',
      payload(65),
      '2026-01-02T10:00:00Z',
      '2026-01-02T10:40:00Z',
    );
    const improved = (
      await db.query('select * from public.workouts where id = $1', [second])
    ).rows[0];
    assert.equal(improved.records.length, 1);
    assert.equal(improved.records[0].previous_best_kg, 60);
    assert.equal(improved.records[0].weight_kg, 65);
    assert.equal(
      (
        await db.query('select * from public.previous_exercise_sets($1)', [
          exercise,
        ])
      ).rows[0].weight,
      '65',
    );

    // A valid insert followed by a bad set must roll back the whole request.
    const invalid = payload(70);
    invalid[0].sets.push({ weight: -1, weight_unit: 'kg', reps: 10 });
    await assert.rejects(finish('rollback-workout-key', invalid));
    assert.equal(
      (await db.query('select count(*)::int as count from public.workouts'))
        .rows[0].count,
      2,
    );
    assert.equal(
      (await db.query('select count(*)::int as count from public.workout_sets'))
        .rows[0].count,
      2,
    );
    await assert.rejects(finish('empty-workout-key', []));
    await assert.rejects(
      finish('duplicate-exercise-key', [...payload(10), ...payload(20)]),
    );
    await assert.rejects(
      finish('fractional-reps-key', [
        {
          exercise_id: exercise,
          sets: [{ weight: 10, weight_unit: 'kg', reps: 1.5 }],
        },
      ]),
    );
    await assert.rejects(
      finish('invalid-unit-key', [
        {
          exercise_id: exercise,
          sets: [{ weight: 10, weight_unit: 'stone', reps: 10 }],
        },
      ]),
    );
    const mixed = await finish(
      'mixed-units-workout',
      [
        {
          exercise_id: exercise,
          sets: [
            { weight: 10, weight_unit: 'kg', reps: 10 },
            { weight: 22.046226218, weight_unit: 'lb', reps: 10 },
          ],
        },
      ],
      '2026-01-03T10:00:00Z',
      '2026-01-03T10:30:00Z',
    );
    assert.equal(
      Number(
        (
          await db.query(
            'select volume_kg from public.workouts where id = $1',
            [mixed],
          )
        ).rows[0].volume_kg,
      ),
      200,
    );
    const foreignExercise = (
      await db.query('select id from public.workout_exercises limit 1')
    ).rows[0].id;

    // Reapplying after real saves must not replace summary values or record snapshots.
    const savedBeforeReapply = (
      await db.query('select * from public.workouts order by id')
    ).rows;
    await db.exec('reset role');
    await db.exec(migration);
    await db.exec('set role authenticated');
    assert.deepEqual(
      (await db.query('select * from public.workouts order by id')).rows,
      savedBeforeReapply,
    );

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      user2,
    ]);
    for (const table of ['workouts', 'workout_exercises', 'workout_sets']) {
      assert.equal(
        (await db.query(`select count(*)::int as count from public.${table}`))
          .rows[0].count,
        0,
        `Cross-user ${table} reads must be blocked`,
      );
    }
    assert.deepEqual(
      (
        await db.query('select * from public.previous_exercise_sets($1)', [
          exercise,
        ])
      ).rows,
      [],
    );
    await assert.rejects(
      db.query(
        "insert into public.workout_sets(workout_exercise_id,set_number,weight,weight_unit,reps) values($1,99,10,'kg',10)",
        [foreignExercise],
      ),
    );
    await assert.rejects(finish('account-changed-draft', payload(20)));
    owner = user2;
    const own = await finish('first-workout-key', payload(20));
    assert.notEqual(own, first, 'Idempotency keys must be scoped to each user');
    assert.equal(
      (await db.query('select count(*)::int as count from public.workouts'))
        .rows[0].count,
      1,
    );
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.workouts'));
    await assert.rejects(finish('anonymous-workout', payload(20)));
    console.log(
      `PASS (${scenario}): migration/reapply, legacy data preservation, catalog, atomic save/rollback, idempotent retries, validation, summaries, mixed-unit volume, PRs, previous sets, cross-user RLS, anonymous denial.`,
    );
  } finally {
    await db.close();
  }
}
