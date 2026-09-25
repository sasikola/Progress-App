import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration = await readFile(
  new URL(
    '../supabase/migrations/202609250003_phase6_photos.sql',
    import.meta.url,
  ),
  'utf8',
);
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
for (const scenario of [
  'existing-dates',
  'missing-recorded-at',
  'null-recorded-at',
  'unknown-dates',
]) {
  const db = new PGlite();
  try {
    // Only models Storage's SQL contract. Real HTTP upload/signing requires live testing.
    await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${user1}'), ('${user2}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, unique(bucket_id, name));
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated, anon;
    -- Pre-existing broad policies must not bypass the private bucket guards.
    create policy old_broad_storage on storage.objects for all to authenticated, anon using (true) with check (true);
    insert into storage.buckets values ('progress-photos','progress-photos',true,null,null), ('unrelated','unrelated',true,null,null);
    insert into storage.objects(bucket_id, name) values ('unrelated','public.jpg');
    create table public.progress_photos(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), photo_type text not null, storage_path text not null, recorded_at timestamptz not null, created_at timestamptz not null default now());
    insert into public.progress_photos(user_id,photo_type,storage_path,recorded_at) values ('${user1}','front','${user1}/legacy.jpg','2020-01-01');
    insert into storage.objects(bucket_id,name) values ('progress-photos','${user1}/legacy.jpg');
    create policy old_broad_metadata on public.progress_photos for select to authenticated using (true);
  `);
    if (scenario === 'missing-recorded-at' || scenario === 'unknown-dates') {
      await db.exec(
        'alter table public.progress_photos drop column recorded_at',
      );
    }
    if (scenario === 'null-recorded-at') {
      await db.exec(
        'alter table public.progress_photos alter column recorded_at drop not null; update public.progress_photos set recorded_at = null',
      );
    }
    if (scenario === 'unknown-dates') {
      await db.exec(
        'alter table public.progress_photos alter column created_at drop not null; update public.progress_photos set created_at = null',
      );
      await assert.rejects(db.exec(migration), /No dates were invented/);
      await db.exec('rollback');
      assert.equal(
        (
          await db.query(
            "select column_name from information_schema.columns where table_schema='public' and table_name='progress_photos' and column_name='recorded_at'",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            'select count(*)::int as n from public.progress_photos',
          )
        ).rows[0].n,
        1,
      );
      console.log(
        'PASS Phase 6: unknown dates stop safely and roll back without losing photos.',
      );
      continue;
    }
    const before = (
      await db.query(
        scenario === 'existing-dates'
          ? 'select id, user_id, photo_type, storage_path, recorded_at, created_at from public.progress_photos'
          : 'select id, user_id, photo_type, storage_path, created_at as recorded_at, created_at from public.progress_photos',
      )
    ).rows;
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual(
      (
        await db.query(
          'select id, user_id, photo_type, storage_path, recorded_at, created_at from public.progress_photos',
        )
      ).rows,
      before,
    );
    assert.equal(
      (
        await db.query(
          "select public from storage.buckets where id='progress-photos'",
        )
      ).rows[0].public,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select file_size_limit::int as size from storage.buckets where id='progress-photos'",
        )
      ).rows[0].size,
      5242880,
    );
    await db.exec('set role authenticated');
    const signIn = id =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await signIn(user1);
    const prepare = (
      user = user1,
      token = 'photo-request-001',
      type = 'front',
      mime = 'image/jpeg',
      size = 100,
    ) =>
      db.query(
        "select public.prepare_progress_photo($1::uuid,$2,$3,'2020-01-02',$4,$5) as photo",
        [user, token, type, mime, size],
      );
    const finish = (user = user1, token = 'photo-request-001') =>
      db.query('select public.finish_progress_photo($1::uuid,$2) as photo', [
        user,
        token,
      ]);
    const pending = (await prepare()).rows[0].photo;
    assert.equal(pending.status, 'pending');
    assert.equal((await prepare()).rows[0].photo.id, pending.id);
    await assert.rejects(finish(), /upload is not available/);
    assert.equal(
      (
        await db.query(
          'select status from public.progress_photos where id=$1',
          [pending.id],
        )
      ).rows[0].status,
      'pending',
    );
    await assert.rejects(prepare(user2), /owner/);
    await assert.rejects(prepare(user1, '../invalid-path'), /request ID/);
    await assert.rejects(
      prepare(user1, 'invalid-category', 'unknown'),
      /category/,
    );
    await assert.rejects(
      prepare(user1, 'invalid-content', 'front', 'image/svg+xml'),
      /JPEG/,
    );
    await assert.rejects(
      prepare(user1, 'invalid-filesize', 'front', 'image/jpeg', 5242881),
      /5 MB/,
    );
    await assert.rejects(
      prepare(user1, 'photo-request-001', 'back'),
      /original photo/,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values ('progress-photos',$1)",
        [user1 + '/unreserved.jpg'],
      ),
      /row-level security/,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values ('progress-photos',$1)",
      [pending.storage_path],
    );
    const ready = (await finish()).rows[0].photo;
    assert.equal(ready.status, 'ready');
    assert.equal((await finish()).rows[0].photo.id, ready.id);
    assert.equal((await prepare()).rows[0].photo.status, 'ready');
    assert.equal(
      (
        await db.query(
          "update storage.objects set name='changed.jpg' where bucket_id='progress-photos' returning id",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where bucket_id='progress-photos' returning id",
        )
      ).rows.length,
      0,
    );
    await signIn(user2);
    assert.equal(
      (await db.query('select * from public.progress_photos')).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='progress-photos'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(finish(user1), /owner/);
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values ('progress-photos',$1)",
        [user1 + '/attack.jpg'],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into public.progress_photos(user_id,photo_type,storage_path,recorded_at) values ($1,'front','attack.jpg',now())",
        [user1],
      ),
      /row-level security/,
    );
    await signIn('');
    await assert.rejects(prepare(), /owner/);
    await db.exec('set role anon');
    await assert.rejects(
      db.query('select * from public.progress_photos'),
      /permission denied/,
    );
    await assert.rejects(prepare(), /permission denied/);
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='progress-photos'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='unrelated'",
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values ('progress-photos','anon.jpg')",
      ),
      /row-level security/,
    );
    await db.exec('reset role');
    const after = (
      await db.query('select * from public.progress_photos order by id')
    ).rows;
    await db.exec(migration);
    assert.deepEqual(
      (await db.query('select * from public.progress_photos order by id')).rows,
      after,
    );
    console.log(
      scenario,
      'PASS Phase 6: preservation/reruns, private bucket, pending/ready, retries, validation, metadata/object RLS, no overwrites, unrelated bucket isolation.',
    );
  } finally {
    await db.close();
  }
}
