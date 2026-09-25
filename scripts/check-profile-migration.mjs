import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Local PostgreSQL only; never connects to the user's Supabase project.
const migration = await readFile(
  new URL(
    '../supabase/migrations/202609250001_profile_compatibility.sql',
    import.meta.url,
  ),
  'utf8',
);
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
for (const scenario of ['fresh', 'reported-schema']) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      insert into auth.users values ('${user1}'), ('${user2}');
    `);
    let original;
    if (scenario === 'reported-schema') {
      await db.exec(`
        create table public.profiles (
          id uuid primary key references auth.users(id) on delete cascade,
          name text not null check (char_length(trim(name)) between 1 and 100),
          date_of_birth date, height numeric,
          height_unit text not null default 'cm' check (height_unit in ('cm', 'ft')),
          goal text check (goal is null or goal in ('muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'maintenance')),
          created_at timestamptz not null default now(), updated_at timestamptz not null default now()
        );
        insert into public.profiles(id, name, date_of_birth, height, goal)
          values ('${user1}', 'Existing name', '1990-01-01', 180, 'strength');
        create policy legacy_read on public.profiles for select to authenticated using (true);
      `);
      original = (await db.query('select * from public.profiles')).rows[0];
    }
    await db.exec(migration);
    await db.exec(migration);
    if (original) {
      const migrated = (await db.query('select * from public.profiles'))
        .rows[0];
      for (const key of Object.keys(original))
        assert.deepEqual(migrated[key], original[key]);
      assert.equal(migrated.onboarding_completed, false);
      assert.equal(migrated.weight_unit, 'kg');
    }
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      user1,
    ]);
    const save = (id, name, goal, weight, unit = 'kg') =>
      db.query(
        'select public.complete_onboarding($1::uuid, $2, $3, $4::numeric, $5) as profile',
        [id, name, goal, weight, unit],
      );
    await assert.rejects(
      save(user2, 'Impersonation', 'strength', 70),
      /profile owner/,
    );
    await assert.rejects(
      save(user1, 'Alex', 'build_muscle', 70),
      /Invalid goal/,
    );
    await assert.rejects(save(user1, 'Alex', 'strength', -1), /Weight/);
    await assert.rejects(
      save(user1, 'Alex', 'strength', 70, 'stone'),
      /Invalid weight unit/,
    );
    // Force a failure AFTER the profile upsert to verify transaction rollback.
    await db.exec(`reset role;
      create policy test_block_weight on public.weight_entries as restrictive
        for insert to authenticated with check (false);
      set role authenticated;`);
    await assert.rejects(
      save(user1, 'Alex', 'muscle_gain', 70),
      /row-level security/,
    );
    const failedRows = (await db.query('select * from public.profiles')).rows;
    assert.equal(failedRows.length, original ? 1 : 0);
    if (original) {
      assert.equal(failedRows[0].onboarding_completed, false);
      assert.equal(failedRows[0].name, original.name);
    }
    await db.exec(
      'reset role; drop policy test_block_weight on public.weight_entries; set role authenticated;',
    );
    const saved = (await save(user1, ' Alex ', 'muscle_gain', 150, 'lb'))
      .rows[0].profile;
    assert.equal(saved.id, user1);
    assert.equal(saved.name, 'Alex');
    assert.equal(saved.goal, 'muscle_gain');
    assert.equal(saved.onboarding_completed, true);
    assert.equal(saved.weight_unit, 'lb');
    if (original) {
      const afterSave = (await db.query('select * from public.profiles'))
        .rows[0];
      for (const key of [
        'date_of_birth',
        'height',
        'height_unit',
        'created_at',
      ])
        assert.deepEqual(afterSave[key], original[key]);
    }
    assert.deepEqual(
      (await save(user1, 'Retry', 'fat_loss', 150, 'lb')).rows[0].profile,
      saved,
    );
    assert.equal(
      (await db.query('select count(*)::int as n from public.weight_entries'))
        .rows[0].n,
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      user2,
    ]);
    assert.equal(
      (await db.query('select * from public.profiles')).rows.length,
      0,
    );
    assert.equal(
      (await db.query('select * from public.weight_entries')).rows.length,
      0,
    );
    await assert.rejects(
      db.query('insert into public.profiles(id, name) values ($1, $2)', [
        user1,
        'Attack',
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into public.weight_entries(user_id, weight, unit) values ($1, 80, 'kg')",
        [user1],
      ),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query(
          "update public.profiles set name = 'Attack' returning id",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await save(user2, 'Second', 'maintenance', null)).rows[0].profile
        .onboarding_completed,
      true,
    );
    assert.equal(
      (await db.query('select * from public.weight_entries')).rows.length,
      0,
    );
    // Reapplying after completion must preserve flags and recorded weights.
    await db.exec('reset role');
    await db.exec(migration);
    assert.equal(
      (
        await db.query(
          'select count(*)::int as n from public.profiles where onboarding_completed',
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (await db.query('select count(*)::int as n from public.weight_entries'))
        .rows[0].n,
      1,
    );
    await db.exec('set role anon');
    await assert.rejects(
      db.query('select * from public.profiles'),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select * from public.weight_entries'),
      /permission denied/,
    );
    await assert.rejects(
      save(user1, 'Anon', 'strength', null),
      /permission denied/,
    );
    console.log(
      `PASS profile migration: ${scenario}, reruns, preservation, atomic rollback, retries, goal validation, RLS`,
    );
  } finally {
    await db.close();
  }
}
