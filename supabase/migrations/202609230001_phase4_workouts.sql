-- Apply the ENTIRE file in Supabase SQL Editor as the project administrator.
-- Supports fresh databases and the reported legacy muscle_group/equipment schema.
-- Existing rows, IDs, names, notes, and extra columns are retained.
begin;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Workout',
  client_id text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  exercise_count integer not null default 0,
  set_count integer not null default 0,
  volume_kg numeric not null default 0,
  records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, client_id),
  check (completed_at >= started_at)
);
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  order_index integer not null check (order_index >= 0),
  created_at timestamptz not null default now(),
  unique (workout_id, exercise_id),
  unique (workout_id, order_index)
);
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  weight numeric not null check (weight >= 0 and weight <= 2000),
  weight_unit text not null check (weight_unit in ('kg', 'lb')),
  reps integer not null check (reps between 1 and 1000),
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workout_exercise_id, set_number)
);

-- CREATE TABLE IF NOT EXISTS does not upgrade existing tables. Add the columns
-- needed by Phase 4 before seeding exercises or creating the RPCs.
alter table public.exercises
  add column if not exists category text,
  add column if not exists description text;
-- to_jsonb supports both legacy rows with muscle_group and fresh rows without it.
update public.exercises e
  set category = coalesce(nullif(btrim(to_jsonb(e)->>'muscle_group'), ''), 'General')
  where category is null or btrim(category) = '' or category = 'General';
update public.exercises set description = '' where description is null;
alter table public.exercises
  alter column category set default 'General',
  alter column category set not null,
  alter column description set default '',
  alter column description set not null;

alter table public.workouts
  add column if not exists name text not null default 'Workout',
  add column if not exists client_id text,
  add column if not exists exercise_count integer,
  add column if not exists set_count integer,
  add column if not exists volume_kg numeric,
  add column if not exists records jsonb;
-- Legacy rows did not have an idempotency key. Assign one without changing IDs.
update public.workouts set client_id = 'legacy-' || id::text where client_id is null;
update public.workouts w set
  exercise_count = coalesce(w.exercise_count, (select count(*)::integer from public.workout_exercises e where e.workout_id = w.id)),
  set_count = coalesce(w.set_count, (select count(*)::integer from public.workout_sets s join public.workout_exercises e on e.id = s.workout_exercise_id where e.workout_id = w.id and s.completed)),
  volume_kg = coalesce(w.volume_kg, (select round(coalesce(sum((case when s.weight_unit = 'lb' then s.weight / 2.2046226218 else s.weight end) * s.reps), 0), 2) from public.workout_sets s join public.workout_exercises e on e.id = s.workout_exercise_id where e.workout_id = w.id and s.completed)),
  records = coalesce(w.records, '[]'::jsonb)
  where exercise_count is null or set_count is null or volume_kg is null or records is null;
-- Keep unfinished historical workouts unfinished; fill only derivable durations.
update public.workouts set duration_seconds = floor(extract(epoch from (completed_at - started_at)))::integer
  where duration_seconds is null and completed_at >= started_at
    and extract(epoch from (completed_at - started_at)) <= 2147483647;
alter table public.workouts
  alter column client_id set not null,
  alter column exercise_count set default 0,
  alter column exercise_count set not null,
  alter column set_count set default 0,
  alter column set_count set not null,
  alter column volume_kg set default 0,
  alter column volume_kg set not null,
  alter column records set default '[]'::jsonb,
  alter column records set not null;
create unique index if not exists progress_workout_request_key on public.workouts(user_id, client_id);
create index if not exists progress_workout_history on public.workouts(user_id, completed_at desc);
create index if not exists progress_exercise_history on public.workout_exercises(exercise_id, workout_id);

alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

drop policy if exists progress_catalog_read on public.exercises;
create policy progress_catalog_read on public.exercises for select to authenticated using (true);
drop policy if exists progress_workouts_read on public.workouts;
create policy progress_workouts_read on public.workouts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists progress_workouts_insert on public.workouts;
create policy progress_workouts_insert on public.workouts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists progress_workouts_update on public.workouts;
create policy progress_workouts_update on public.workouts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists progress_workout_exercises_read on public.workout_exercises;
create policy progress_workout_exercises_read on public.workout_exercises for select to authenticated using (
  exists(select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
);
drop policy if exists progress_workout_exercises_insert on public.workout_exercises;
create policy progress_workout_exercises_insert on public.workout_exercises for insert to authenticated with check (
  exists(select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
);
drop policy if exists progress_workout_sets_read on public.workout_sets;
create policy progress_workout_sets_read on public.workout_sets for select to authenticated using (
  exists(select 1 from public.workout_exercises e join public.workouts w on w.id = e.workout_id
    where e.id = workout_exercise_id and w.user_id = (select auth.uid()))
);
drop policy if exists progress_workout_sets_insert on public.workout_sets;
create policy progress_workout_sets_insert on public.workout_sets for insert to authenticated with check (
  exists(select 1 from public.workout_exercises e join public.workouts w on w.id = e.workout_id
    where e.id = workout_exercise_id and w.user_id = (select auth.uid()))
);

revoke all on public.exercises, public.workouts, public.workout_exercises, public.workout_sets from anon;
grant select on public.exercises to authenticated;
grant select, insert, update on public.workouts to authenticated;
grant select, insert on public.workout_exercises, public.workout_sets to authenticated;

-- Legacy catalogs may not have a unique name constraint (and may contain valid
-- duplicate names with different equipment). Do not delete or merge those IDs.
-- The table lock makes seeding safe against concurrent inserts during migration.
lock table public.exercises in share row exclusive mode;
with seed(name, category, description) as (values
 ('Bench Press', 'Chest', 'Barbell bench press. Log total external load, including the bar.'),
 ('Squat', 'Legs', 'Barbell squat. Log total external load, including the bar.'),
 ('Deadlift', 'Back', 'Barbell deadlift. Log total external load, including the bar.'),
 ('Overhead Press', 'Shoulders', 'Standing barbell press. Log total load including the bar.'),
 ('Barbell Row', 'Back', 'Bent-over barbell row. Log total load including the bar.'),
 ('Pull Up', 'Back', 'Log added load only; use 0 for an unweighted bodyweight set.'),
 ('Lat Pulldown', 'Back', 'Log the selected machine load. Use the same machine for comparisons.'),
 ('Dumbbell Curl', 'Arms', 'Log combined dumbbell load and reps per arm; keep this convention consistent.'),
 ('Triceps Pushdown', 'Arms', 'Log the selected cable-stack load.'),
 ('Leg Press', 'Legs', 'Log the external load shown/added; use the same machine for comparisons.')
)
insert into public.exercises (name, category, description)
select seed.name, seed.category, seed.description from seed
where not exists (select 1 from public.exercises e where e.name = seed.name);

-- SECURITY INVOKER: every read/write below is subject to the caller's RLS.
create or replace function public.finish_workout(
  p_user_id uuid, p_client_id text, p_started_at timestamptz, p_completed_at timestamptz, p_exercises jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_workout uuid;
  v_exercise_row uuid;
  v_exercise_id uuid;
  v_item jsonb;
  v_set jsonb;
  v_name text;
  v_order integer := 0;
  v_set_number integer;
  v_total_sets integer := 0;
  v_weight numeric;
  v_reps integer;
  v_kg numeric;
  v_volume numeric := 0;
  v_best numeric;
  v_previous numeric;
  v_records jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if v_user is distinct from p_user_id then raise exception 'Account changed; sign in to the draft owner account' using errcode = '42501'; end if;
  if p_client_id is null or length(p_client_id) not between 8 and 100 then raise exception 'Invalid request ID'; end if;
  -- Serialize retries (including simultaneous requests after a timeout).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || p_client_id, 0));
  select id into v_workout from public.workouts where user_id = v_user and client_id = p_client_id;
  if found then return v_workout; end if;
  if p_started_at is null or p_completed_at is null or p_completed_at < p_started_at
    or p_completed_at > now() + interval '5 minutes'
    or extract(epoch from (p_completed_at - p_started_at)) > 2147483647 then
    raise exception 'Invalid workout time';
  end if;
  if coalesce(jsonb_typeof(p_exercises), '') <> 'array' then raise exception 'Exercises must be an array'; end if;
  if jsonb_array_length(p_exercises) not between 1 and 30 then raise exception 'Use 1 to 30 exercises'; end if;
  if (select count(distinct (value->>'exercise_id')::uuid) from jsonb_array_elements(p_exercises)) <> jsonb_array_length(p_exercises) then
    raise exception 'Exercises must have distinct valid IDs';
  end if;
  -- Explicit name also supports legacy workouts.name NOT NULL with no default.
  insert into public.workouts(user_id, name, client_id, started_at, completed_at, duration_seconds)
    values(v_user, 'Workout', p_client_id, p_started_at, p_completed_at, floor(extract(epoch from (p_completed_at - p_started_at)))::integer)
    returning id into v_workout;
  for v_item in select value from jsonb_array_elements(p_exercises) loop
    v_exercise_id := (v_item->>'exercise_id')::uuid;
    select name into strict v_name from public.exercises where id = v_exercise_id;
    if coalesce(jsonb_typeof(v_item->'sets'), '') <> 'array' then raise exception 'Sets must be an array'; end if;
    if jsonb_array_length(v_item->'sets') not between 1 and 20 then raise exception 'Use 1 to 20 completed sets per exercise'; end if;
    insert into public.workout_exercises(workout_id, exercise_id, order_index)
      values(v_workout, v_exercise_id, v_order) returning id into v_exercise_row;
    v_set_number := 0;
    v_best := 0;
    for v_set in select value from jsonb_array_elements(v_item->'sets') loop
      if coalesce(jsonb_typeof(v_set->'weight'), '') <> 'number' or coalesce(jsonb_typeof(v_set->'reps'), '') <> 'number'
        or (v_set->>'reps')::numeric <> trunc((v_set->>'reps')::numeric) then raise exception 'Invalid set values'; end if;
      v_weight := (v_set->>'weight')::numeric;
      v_reps := (v_set->>'reps')::integer;
      v_set_number := v_set_number + 1;
      insert into public.workout_sets(workout_exercise_id, set_number, weight, weight_unit, reps, completed)
        values(v_exercise_row, v_set_number, v_weight, v_set->>'weight_unit', v_reps, true);
      v_kg := case when v_set->>'weight_unit' = 'lb' then v_weight / 2.2046226218 else v_weight end;
      v_volume := v_volume + v_kg * v_reps;
      v_best := greatest(v_best, v_kg);
      v_total_sets := v_total_sets + 1;
    end loop;
    select max(case when s.weight_unit = 'lb' then s.weight / 2.2046226218 else s.weight end)
      into v_previous from public.workout_sets s
      join public.workout_exercises e on e.id = s.workout_exercise_id
      join public.workouts w on w.id = e.workout_id
      where w.user_id = v_user and w.id <> v_workout and w.completed_at <= p_completed_at
        and e.exercise_id = v_exercise_id and s.completed;
    -- First performances establish baselines, not fabricated PRs. 0.01 kg tolerance.
    if v_previous is not null and v_best > v_previous + 0.01 then
      v_records := v_records || jsonb_build_array(jsonb_build_object('exercise_id', v_exercise_id,
        'name', v_name, 'weight_kg', round(v_best, 2), 'previous_best_kg', round(v_previous, 2)));
    end if;
    v_order := v_order + 1;
  end loop;
  update public.workouts set exercise_count = v_order, set_count = v_total_sets,
    volume_kg = round(v_volume, 2), records = v_records where id = v_workout;
  return v_workout;
end;
$$;

create or replace function public.previous_exercise_sets(p_exercise_id uuid)
returns table(weight numeric, weight_unit text, reps integer, set_number integer, completed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with previous as (
    select e.id, w.completed_at from public.workout_exercises e
      join public.workouts w on w.id = e.workout_id
      where w.user_id = (select auth.uid()) and e.exercise_id = p_exercise_id and w.completed_at is not null
      order by w.completed_at desc, w.id desc limit 1
  )
  select s.weight, s.weight_unit, s.reps, s.set_number, p.completed_at from previous p
    join public.workout_sets s on s.workout_exercise_id = p.id where s.completed order by s.set_number;
$$;
revoke all on function public.finish_workout(uuid, text, timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.previous_exercise_sets(uuid) from public, anon;
grant execute on function public.finish_workout(uuid, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.previous_exercise_sets(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
