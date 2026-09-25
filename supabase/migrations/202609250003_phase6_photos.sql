-- Apply the entire file in Supabase SQL Editor as the project administrator.
-- Uses Supabase Storage's existing storage.buckets/objects schema. No secrets.
begin;

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_type text not null check (photo_type in ('front','side','back')),
  storage_path text not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);
-- CREATE TABLE IF NOT EXISTS does not upgrade an existing table. Older
-- installations may only have created_at; retain that as the timeline fallback,
-- not as a claim about when the photo was taken. Never replace known dates.
alter table public.progress_photos add column if not exists recorded_at timestamptz;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'progress_photos' and column_name = 'created_at') then
    update public.progress_photos set recorded_at = created_at where recorded_at is null;
  end if;
  if exists (select 1 from public.progress_photos where recorded_at is null) then
    raise exception 'Some existing photos have no recorded_at or created_at timestamp. No dates were invented; the migration has been rolled back.'
      using hint = 'Inspect the progress_photos schema and supply verified historical dates before rerunning.';
  end if;
end;
$$;
alter table public.progress_photos alter column recorded_at set not null;
-- Old metadata is preserved; new uploads explicitly start as pending.
alter table public.progress_photos
  add column if not exists client_id text,
  add column if not exists status text not null default 'ready' check (status in ('pending','ready')),
  add column if not exists content_type text,
  add column if not exists byte_size integer;
create unique index if not exists progress_photo_request on public.progress_photos(user_id, client_id);
create index if not exists progress_photo_timeline on public.progress_photos(user_id, status, recorded_at desc, id desc);
alter table public.progress_photos enable row level security;
drop policy if exists progress_photos_owner_guard on public.progress_photos;
create policy progress_photos_owner_guard on public.progress_photos as restrictive for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists progress_photos_read on public.progress_photos;
create policy progress_photos_read on public.progress_photos for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists progress_photos_insert on public.progress_photos;
create policy progress_photos_insert on public.progress_photos for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists progress_photos_update on public.progress_photos;
create policy progress_photos_update on public.progress_photos for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.progress_photos from anon;
grant select, insert, update on public.progress_photos to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg','image/png'])
  on conflict (id) do update set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png'];

-- These guards also constrain old permissive policies, but do not affect
-- other buckets. Both metadata and object paths must belong to the caller.
drop policy if exists progress_photo_objects_guard on storage.objects;
create policy progress_photo_objects_guard on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'progress-photos' or (
    (select auth.uid())::text = split_part(name, '/', 1) and exists (
      select 1 from public.progress_photos p where p.user_id = (select auth.uid()) and p.storage_path = name
    )
  )) with check (bucket_id <> 'progress-photos' or (
    (select auth.uid())::text = split_part(name, '/', 1) and exists (
      select 1 from public.progress_photos p where p.user_id = (select auth.uid()) and p.storage_path = name
    )
  ));
drop policy if exists progress_photo_objects_anon_guard on storage.objects;
create policy progress_photo_objects_anon_guard on storage.objects as restrictive for all to anon
  using (bucket_id <> 'progress-photos') with check (bucket_id <> 'progress-photos');
drop policy if exists progress_photo_objects_read on storage.objects;
create policy progress_photo_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (select auth.uid())::text = split_part(name, '/', 1));
drop policy if exists progress_photo_objects_insert on storage.objects;
create policy progress_photo_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (select auth.uid())::text = split_part(name, '/', 1));
-- Uploads are immutable; retries never overwrite an existing private photo.
drop policy if exists progress_photo_objects_no_update on storage.objects;
create policy progress_photo_objects_no_update on storage.objects as restrictive for update to public
  using (bucket_id <> 'progress-photos') with check (bucket_id <> 'progress-photos');
drop policy if exists progress_photo_objects_no_delete on storage.objects;
create policy progress_photo_objects_no_delete on storage.objects as restrictive for delete to public
  using (bucket_id <> 'progress-photos');

create or replace function public.prepare_progress_photo(
  p_user_id uuid, p_client_id text, p_photo_type text, p_recorded_at timestamptz, p_content_type text, p_byte_size integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_photo public.progress_photos%rowtype;
  v_path text;
begin
  if v_user is null or v_user is distinct from p_user_id then raise exception 'Photo owner must be signed in' using errcode = '42501'; end if;
  if p_client_id is null or p_client_id !~ '^[A-Za-z0-9_-]{8,100}$' then raise exception 'Invalid request ID'; end if;
  if p_photo_type is null or p_photo_type not in ('front','side','back') then raise exception 'Invalid photo category'; end if;
  if p_recorded_at is null or not isfinite(p_recorded_at) or p_recorded_at < '1900-01-01'::timestamptz or p_recorded_at > now() + interval '5 minutes' then raise exception 'Invalid photo date'; end if;
  if p_content_type is null or p_content_type not in ('image/jpeg','image/png') or p_byte_size is null or p_byte_size not between 1 and 5242880 then raise exception 'Use a JPEG or PNG up to 5 MB'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photo:' || v_user::text || p_client_id, 0));
  select * into v_photo from public.progress_photos where user_id = v_user and client_id = p_client_id;
  if found then
    if v_photo.photo_type is distinct from p_photo_type or v_photo.recorded_at is distinct from p_recorded_at
      or v_photo.content_type is distinct from p_content_type or v_photo.byte_size is distinct from p_byte_size then
      raise exception 'Retry the original photo details';
    end if;
    return to_jsonb(v_photo);
  end if;
  v_path := v_user::text || '/' || p_client_id || case when p_content_type = 'image/png' then '.png' else '.jpg' end;
  insert into public.progress_photos(user_id, client_id, photo_type, storage_path, recorded_at, status, content_type, byte_size)
    values(v_user, p_client_id, p_photo_type, v_path, p_recorded_at, 'pending', p_content_type, p_byte_size) returning * into v_photo;
  return to_jsonb(v_photo);
end;
$$;

create or replace function public.finish_progress_photo(p_user_id uuid, p_client_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_photo public.progress_photos%rowtype;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'Photo owner must be signed in' using errcode = '42501'; end if;
  select * into strict v_photo from public.progress_photos where user_id = auth.uid() and client_id = p_client_id for update;
  if not exists(select 1 from storage.objects o where o.bucket_id = 'progress-photos' and o.name = v_photo.storage_path) then
    raise exception 'Photo upload is not available yet. Retry the upload.';
  end if;
  update public.progress_photos set status = 'ready' where id = v_photo.id returning * into v_photo;
  return to_jsonb(v_photo);
end;
$$;
revoke all on function public.prepare_progress_photo(uuid, text, text, timestamptz, text, integer) from public, anon;
revoke all on function public.finish_progress_photo(uuid, text) from public, anon;
grant execute on function public.prepare_progress_photo(uuid, text, text, timestamptz, text, integer) to authenticated;
grant execute on function public.finish_progress_photo(uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
