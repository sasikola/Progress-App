import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// An isolated in-memory PostgreSQL database; never connects to the real project.
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
const [phase9, phase10] = await Promise.all(
  ['202609260001_phase9_nutrition.sql', '202609270001_phase10_nutrition_extras.sql'].map(
    file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
  ),
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
    await db.exec(phase9);
    await db.exec(phase10);
    await db.exec(phase10); // Repeat deployment must not error or duplicate policies/objects.

    const usdaFoodId = (
      await db.query(
        `insert into public.foods(source, source_food_id, name, calories, protein_g, carbs_g, fat_g)
         values ('usda', 'fdc-171077', 'Chicken breast', 165, 31, 0, 3.6) returning id`,
      )
    ).rows[0].id;

    await db.exec('set role authenticated');
    const signIn = id =>
      db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await signIn(user1);

    // --- custom food creation ---
    const customFoodId = (
      await db.query(
        `insert into public.foods(source, created_by, name, calories, protein_g, carbs_g, fat_g)
         values ('custom', $1, 'Grandma''s dal', 180, 9, 22, 6) returning id`,
        [user1],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        `insert into public.foods(source, created_by, name, calories, protein_g, carbs_g, fat_g)
         values ('custom', $1, 'Spoofed for another user', 100, 1, 1, 1)`,
        [user2],
      ),
      'must not create a custom food owned by a different user',
    );
    await assert.rejects(
      db.query(
        `insert into public.foods(source, created_by, name, calories, protein_g, carbs_g, fat_g)
         values ('usda', $1, 'Spoofed provider row', 100, 1, 1, 1)`,
        [user1],
      ),
      'authenticated clients must not insert non-custom provider rows',
    );
    await signIn(user2);
    assert.equal(
      (await db.query('select id from public.foods where id = $1', [customFoodId])).rows.length,
      0,
      'another user must not see a different user’s custom food',
    );
    await signIn(user1);

    // --- favorite foods: idempotent add, owner-only, cross-user isolation ---
    await db.query(
      `insert into public.favorite_foods(user_id, food_id) values ($1, $2)
       on conflict (user_id, food_id) do nothing`,
      [user1, usdaFoodId],
    );
    await db.query(
      `insert into public.favorite_foods(user_id, food_id) values ($1, $2)
       on conflict (user_id, food_id) do nothing`,
      [user1, usdaFoodId],
    );
    assert.equal(
      (await db.query('select * from public.favorite_foods where user_id = $1', [user1])).rows.length,
      1,
      'a retried favorite must not duplicate',
    );
    await signIn(user2);
    assert.equal(
      (await db.query('select * from public.favorite_foods')).rows.length,
      0,
      'another user must not see a different user’s favorites',
    );
    const crossDelete = await db.query(
      'delete from public.favorite_foods where user_id = $1 and food_id = $2',
      [user1, usdaFoodId],
    );
    assert.equal(crossDelete.affectedRows, 0, 'a cross-user delete must match zero rows');
    await signIn(user1);
    assert.equal(
      (await db.query('select * from public.favorite_foods where user_id = $1', [user1])).rows.length,
      1,
      'the favorite must be unaffected by another user’s delete attempt',
    );
    await db.query('delete from public.favorite_foods where user_id = $1 and food_id = $2', [
      user1,
      usdaFoodId,
    ]);
    assert.equal(
      (await db.query('select * from public.favorite_foods where user_id = $1', [user1])).rows.length,
      0,
      'the owner can remove their own favorite',
    );

    // --- recent_foods: distinct, most-recent-first, user-scoped, limited ---
    const logEntry = (clientId, foodId, consumedAt) =>
      db.query(
        `select public.log_food_entry(
          $1::uuid, $2, $3::uuid, 'lunch', $4::timestamptz, $4::date, 100, 'g', 100, 10, 10, 10
        ) as entry`,
        [user1, clientId, foodId, consumedAt],
      );
    await logEntry('recent-1', usdaFoodId, '2020-01-01T12:00:00Z');
    await logEntry('recent-2', customFoodId, '2020-01-02T12:00:00Z');
    await logEntry('recent-3', usdaFoodId, '2020-01-03T12:00:00Z'); // same food again, later

    const recent = (await db.query('select * from public.recent_foods(10)')).rows;
    assert.equal(recent.length, 2, 'repeated use of the same food counts once, by its latest use');
    assert.equal(recent[0].id, usdaFoodId, 'the most recently used food comes first');
    assert.equal(recent[1].id, customFoodId);
    assert.equal(
      (await db.query('select * from public.recent_foods(1)')).rows.length,
      1,
      'the limit is respected',
    );
    await signIn(user2);
    assert.equal(
      (await db.query('select * from public.recent_foods(10)')).rows.length,
      0,
      'recent foods are user-scoped',
    );

    // --- anon is fully blocked ---
    await db.exec('reset role');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.favorite_foods'), /permission denied/);
    await assert.rejects(db.query('select * from public.recent_foods(10)'), /permission denied/);
    await assert.rejects(
      db.query(
        `insert into public.favorite_foods(user_id, food_id) values ($1, $2)`,
        [user1, usdaFoodId],
      ),
      /permission denied/,
    );

    await db.exec('reset role');
    const beforeRerun = (await db.query('select * from public.foods order by id')).rows;
    await db.exec(phase10);
    assert.deepEqual(
      (await db.query('select * from public.foods order by id')).rows,
      beforeRerun,
      'reapplying phase 10 must preserve existing food rows',
    );

    console.log(
      'PASS Phase 10:',
      scenario,
      'custom food ownership, favorite idempotency/isolation, recent-foods scoping, rerun safety',
    );
  } finally {
    await db.close();
  }
}
