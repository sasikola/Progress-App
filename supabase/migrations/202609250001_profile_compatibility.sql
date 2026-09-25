-- Run the whole file in Supabase SQL Editor as the project administrator.
-- Targets profiles.id = auth.users.id (the reported schema), not a separate user_id.
-- Preserves existing IDs, names, goals, dates of birth, heights and timestamps.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  date_of_birth date,
  height numeric,
  height_unit text not null default 'cm' check (height_unit in ('cm', 'ft')),
  goal text check (goal in ('muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'maintenance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stop on the older, incompatible separate-profile-ID layout rather than
-- silently reassigning identities or creating duplicate profiles.
do $$
begin
  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id') then
    raise exception 'This migration expects profiles.id to be the auth user ID, with no user_id column. Inspect the profile identity mapping before migrating.';
  end if;
end;
$$;

-- Do not infer onboarding completion from old profile fields. Existing rows
-- without a completion flag will see onboarding once after this migration.
alter table public.profiles
  add column if not exists weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  add column if not exists onboarding_completed boolean not null default false;

create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight numeric not null check (weight > 0 and weight < 1000),
  unit text not null check (unit in ('kg', 'lb')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists progress_weight_history on public.weight_entries(user_id, recorded_at desc);

alter table public.profiles enable row level security;
alter table public.weight_entries enable row level security;

-- Keep unrelated policies. Restrictive guards ensure an older permissive
-- policy cannot grant access to another user's rows.
drop policy if exists progress_profiles_owner_guard on public.profiles;
create policy progress_profiles_owner_guard on public.profiles as restrictive
  for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists progress_profiles_read on public.profiles;
create policy progress_profiles_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists progress_profiles_insert on public.profiles;
create policy progress_profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists progress_profiles_update on public.profiles;
create policy progress_profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists progress_weight_owner_guard on public.weight_entries;
create policy progress_weight_owner_guard on public.weight_entries as restrictive
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists progress_weight_read on public.weight_entries;
create policy progress_weight_read on public.weight_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists progress_weight_insert on public.weight_entries;
create policy progress_weight_insert on public.weight_entries for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.weight_entries from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.weight_entries to authenticated;

-- SECURITY INVOKER: all reads/writes remain subject to the caller's RLS.
create or replace function public.complete_onboarding(
  p_user_id uuid, p_name text, p_goal text, p_weight numeric default null, p_weight_unit text default 'kg'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user is null or v_user is distinct from p_user_id then
    raise exception 'Authentication required for the profile owner' using errcode = '42501';
  end if;
  -- Serialize submissions, including retries after a lost response.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('onboarding:' || v_user::text, 0));
  select * into v_profile from public.profiles where id = v_user;
  if found and v_profile.onboarding_completed then return to_jsonb(v_profile); end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'Name must contain 1 to 80 characters' using errcode = '22023';
  end if;
  if p_goal is null or p_goal not in ('muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'maintenance') then
    raise exception 'Invalid goal' using errcode = '22023';
  end if;
  if p_weight_unit is null or p_weight_unit not in ('kg', 'lb') then
    raise exception 'Invalid weight unit' using errcode = '22023';
  end if;
  if p_weight is not null and not (p_weight > 0 and p_weight < 1000) then
    raise exception 'Weight must be greater than 0 and less than 1000' using errcode = '22023';
  end if;

  insert into public.profiles(id, name, goal, weight_unit, onboarding_completed)
    values(v_user, trim(p_name), p_goal, p_weight_unit, true)
    on conflict (id) do update set name = excluded.name, goal = excluded.goal,
      weight_unit = excluded.weight_unit, onboarding_completed = true, updated_at = now()
    returning * into v_profile;
  if p_weight is not null then
    insert into public.weight_entries(user_id, weight, unit) values(v_user, p_weight, p_weight_unit);
  end if;
  return to_jsonb(v_profile);
end;
$$;
revoke all on function public.complete_onboarding(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.complete_onboarding(uuid, text, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';
commit;
