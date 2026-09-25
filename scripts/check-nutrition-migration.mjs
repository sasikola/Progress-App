import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// An isolated in-memory PostgreSQL database; never connects to the real project.
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
const migration = await readFile(
  new URL(
    '../supabase/migrations/202609260001_phase9_nutrition.sql',
    import.meta.url,
  ),
  'utf8',
);

for (const scenario of ['fresh', 'rerun-with-data']) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${user1}'), ('${user2}');
    `);
    await db.exec(migration);
    await db.exec(migration); // Repeat deployment must not error or duplicate policies/objects.

    // Regression test: the search-foods Edge Function upserts with a plain
    // `ON CONFLICT (source, source_food_id)`, exactly like postgrest-js's
    // `.upsert(rows, { onConflict: 'source,source_food_id' })` generates. A
    // partial unique index cannot serve as that conflict target ("there is
    // no unique or exclusion constraint matching the ON CONFLICT
    // specification"), so this must run as a plain INSERT ... ON CONFLICT,
    // not a manual check-then-insert.
    await db.query(
      `insert into public.foods(source, source_food_id, name, calories, protein_g, carbs_g, fat_g)
       values ('usda', 'fdc-conflict-test', 'Egg', 70, 6, 0.4, 5)
       on conflict (source, source_food_id) do update set name = excluded.name, calories = excluded.calories`,
    );
    const upserted = await db.query(
      `insert into public.foods(source, source_food_id, name, calories, protein_g, carbs_g, fat_g)
       values ('usda', 'fdc-conflict-test', 'Egg, large', 72, 6.3, 0.4, 4.8)
       on conflict (source, source_food_id) do update set name = excluded.name, calories = excluded.calories
       returning name, calories`,
    );
    assert.deepEqual(
      { name: upserted.rows[0].name, calories: Number(upserted.rows[0].calories) },
      { name: 'Egg, large', calories: 72 },
      'the upsert must update the existing row, not fail or duplicate it',
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as count from public.foods where source_food_id = 'fdc-conflict-test'`,
        )
      ).rows[0].count,
      1,
    );
    // Multiple custom foods (source_food_id always null) must still coexist
    // under the same non-partial unique index, since Postgres treats every
    // NULL as distinct for uniqueness.
    await db.query(
      `insert into public.foods(source, created_by, name, calories, protein_g, carbs_g, fat_g)
       values ('custom', $1, 'Another custom food', 100, 1, 1, 1), ('custom', $1, 'Yet another', 100, 1, 1, 1)`,
      [user1],
    );

    // Seed a shared (provider) food and a custom food as the table owner,
    // mirroring how the search-foods Edge Function writes with the
    // service-role key (which is not subject to RLS).
    const usdaFoodId = (
      await db.query(
        `insert into public.foods(source, source_food_id, name, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g)
         values ('usda', 'fdc-171077', 'Chicken breast', 100, 'g', 165, 31, 0, 3.6) returning id`,
      )
    ).rows[0].id;
    const customFoodId = (
      await db.query(
        `insert into public.foods(source, created_by, name, calories, protein_g, carbs_g, fat_g)
         values ('custom', $1, 'Grandma''s dal', 180, 9, 22, 6) returning id`,
        [user1],
      )
    ).rows[0].id;

    if (scenario === 'rerun-with-data') {
      // Confirms the second migration apply below preserves rows already present.
    }

    await db.exec('set role authenticated');
    const signIn = id =>
      db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await signIn(user1);

    // --- foods visibility ---
    // 2 shared usda rows (fdc-conflict-test, Chicken breast) + 3 of user1's
    // own custom rows (2 seeded above + Grandma's dal).
    assert.equal(
      (await db.query('select id from public.foods order by id')).rows.length,
      5,
      'owner sees both shared provider foods and their own custom foods',
    );
    await signIn(user2);
    assert.equal(
      (await db.query('select id from public.foods order by id')).rows.length,
      2,
      'another user must not see a different user’s custom foods',
    );
    await assert.rejects(
      db.query('update public.foods set name = $1 where id = $2', [
        'hijacked',
        customFoodId,
      ]),
    );

    // --- log_food_entry: idempotency, validation, ownership ---
    await signIn(user1);
    const logEntry = (
      clientId,
      overrides = {},
    ) => {
      const p = {
        food_id: usdaFoodId,
        meal_type: 'lunch',
        consumed_at: '2020-01-01T12:30:00Z',
        local_date: '2020-01-01',
        quantity: 200,
        unit: 'g',
        calories: 330,
        protein_g: 62,
        carbs_g: 0,
        fat_g: 7.2,
        ...overrides,
      };
      return db.query(
        `select public.log_food_entry(
          $1::uuid, $2, $3::uuid, $4, $5::timestamptz, $6::date, $7::numeric, $8,
          $9::numeric, $10::numeric, $11::numeric, $12::numeric
        ) as entry`,
        [
          user1,
          clientId,
          p.food_id,
          p.meal_type,
          p.consumed_at,
          p.local_date,
          p.quantity,
          p.unit,
          p.calories,
          p.protein_g,
          p.carbs_g,
          p.fat_g,
        ],
      );
    };
    const firstEntry = (await logEntry('lunch-request-001')).rows[0].entry;
    assert.equal(Number(firstEntry.calories), 330);
    assert.equal(firstEntry.local_date, '2020-01-01');
    const retryEntry = (await logEntry('lunch-request-001')).rows[0].entry;
    assert.equal(retryEntry.id, firstEntry.id, 'retry with same client_id must not duplicate the entry');
    assert.equal(
      (await db.query('select count(*)::int as count from public.food_entries')).rows[0].count,
      1,
    );
    for (const overrides of [
      { meal_type: 'brunch' },
      { quantity: 0 },
      { quantity: -5 },
      { unit: 'lb' },
      { calories: -1 },
      { protein_g: null },
      { food_id: '00000000-0000-4000-8000-000000000099' },
      { consumed_at: new Date(Date.now() + 86400000).toISOString() },
      { local_date: '1800-01-01' },
    ])
      await assert.rejects(
        logEntry('rejected-' + JSON.stringify(overrides), overrides),
      );
    await assert.rejects(
      db.query(
        `select public.log_food_entry($1::uuid, 'wrong-owner', $2::uuid, 'lunch', now(), current_date, 100, 'g', 100, 10, 10, 10)`,
        [user2, usdaFoodId],
      ),
    );

    // --- direct update/delete under RLS ---
    await db.query(
      'update public.food_entries set quantity = 250, calories = 412.5 where id = $1',
      [firstEntry.id],
    );
    assert.equal(
      Number(
        (await db.query('select calories from public.food_entries where id = $1', [firstEntry.id])).rows[0].calories,
      ),
      412.5,
    );
    await signIn(user2);
    assert.equal(
      (await db.query('select * from public.food_entries')).rows.length,
      0,
      'another user must not see the entry',
    );
    const crossUpdate = await db.query(
      'update public.food_entries set quantity = 999 where id = $1',
      [firstEntry.id],
    );
    assert.equal(crossUpdate.affectedRows, 0, 'a cross-user update must match zero rows');
    const crossDelete = await db.query('delete from public.food_entries where id = $1', [firstEntry.id]);
    assert.equal(crossDelete.affectedRows, 0, 'a cross-user delete must match zero rows');
    await signIn(user1);
    assert.equal(
      Number(
        (await db.query('select quantity from public.food_entries where id = $1', [firstEntry.id])).rows[0].quantity,
      ),
      250,
      'the entry must be unaffected by another user’s update/delete attempts',
    );
    await db.query('delete from public.food_entries where id = $1', [firstEntry.id]);
    assert.equal(
      (await db.query('select * from public.food_entries')).rows.length,
      0,
      'the owner can delete their own entry',
    );

    // --- set_nutrition_target: idempotency, validation, versioning ---
    const setTarget = (clientId, overrides = {}) => {
      const p = {
        calories: 2400,
        protein_g: 170,
        carbs_g: 260,
        fat_g: 70,
        effective_from: '2026-09-01',
        ...overrides,
      };
      return db.query(
        `select public.set_nutrition_target($1::uuid, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::date) as target`,
        [user1, clientId, p.calories, p.protein_g, p.carbs_g, p.fat_g, p.effective_from],
      );
    };
    const target1 = (await setTarget('target-sept')).rows[0].target;
    assert.equal((await setTarget('target-sept')).rows[0].target.id, target1.id);
    const target2 = (
      await setTarget('target-oct', { calories: 2200, effective_from: '2026-10-01' })
    ).rows[0].target;
    assert.notEqual(target1.id, target2.id);
    const current = (
      await db.query(
        `select * from public.nutrition_targets where user_id = $1 and effective_from <= $2::date order by effective_from desc limit 1`,
        [user1, '2026-09-20'],
      )
    ).rows[0];
    assert.equal(Number(current.calories), 2400, 'a date before October must resolve to the September target');
    for (const overrides of [
      { calories: 0 },
      { calories: -100 },
      { protein_g: -1 },
      { effective_from: '1800-01-01' },
    ])
      await assert.rejects(setTarget('rejected-' + JSON.stringify(overrides), overrides));

    // --- anon is fully blocked ---
    await db.exec('reset role');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.foods'), /permission denied/);
    await assert.rejects(db.query('select * from public.food_entries'), /permission denied/);
    await assert.rejects(db.query('select * from public.nutrition_targets'), /permission denied/);
    await assert.rejects(
      db.query(
        `select public.log_food_entry($1::uuid, 'anon-entry', $2::uuid, 'lunch', now(), current_date, 100, 'g', 100, 10, 10, 10)`,
        [user1, usdaFoodId],
      ),
      /permission denied/,
    );

    await db.exec('reset role');
    const beforeRerun = (await db.query('select * from public.foods order by id')).rows;
    await db.exec(migration);
    assert.deepEqual(
      (await db.query('select * from public.foods order by id')).rows,
      beforeRerun,
      'reapplying the migration must preserve existing food rows',
    );

    console.log(
      'PASS Phase 9:',
      scenario,
      'schema, idempotent inserts, validation, RLS isolation, target versioning, rerun safety',
    );
  } finally {
    await db.close();
  }
}
