-- Apply AFTER the Phase 4 workout and profile compatibility migrations.
-- Additive: preserves existing weights, measurements, profiles and workouts.
begin;

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measurement_type text not null check (measurement_type in ('chest','waist','hips','left_arm','right_arm','left_thigh','right_thigh')),
  value numeric not null check (value > 0 and value < 1000),
  unit text not null check (unit in ('cm','in')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.weight_entries add column if not exists client_id text;
alter table public.measurements add column if not exists client_id text;
create unique index if not exists progress_weight_request on public.weight_entries(user_id, client_id);
create unique index if not exists progress_measurement_request on public.measurements(user_id, client_id);
create index if not exists progress_measurement_history on public.measurements(user_id, measurement_type, recorded_at desc, id desc);
create index if not exists progress_weight_cursor on public.weight_entries(user_id, recorded_at desc, id desc);

alter table public.measurements enable row level security;
drop policy if exists progress_measurements_guard on public.measurements;
create policy progress_measurements_guard on public.measurements as restrictive for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists progress_measurements_read on public.measurements;
create policy progress_measurements_read on public.measurements for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists progress_measurements_insert on public.measurements;
create policy progress_measurements_insert on public.measurements for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.measurements from anon;
grant select, insert on public.measurements to authenticated;

create or replace function public.log_progress_entry(
  p_user_id uuid, p_client_id text, p_kind text, p_value numeric, p_unit text, p_recorded_at timestamptz
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or v_user is distinct from p_user_id then
    raise exception 'Account changed; sign in to the entry owner account' using errcode = '42501';
  end if;
  if p_client_id is null or length(p_client_id) not between 8 and 100 then
    raise exception 'Invalid request ID' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('weight','chest','waist','hips','left_arm','right_arm','left_thigh','right_thigh') then
    raise exception 'Invalid measurement type' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('progress:' || v_user::text || p_client_id, 0));
  if p_kind = 'weight' then
    select id into v_id from public.weight_entries where user_id = v_user and client_id = p_client_id;
  else
    select id into v_id from public.measurements where user_id = v_user and client_id = p_client_id;
  end if;
  if v_id is not null then return v_id; end if;
  if p_value is null or not (p_value > 0 and p_value < 1000) then
    raise exception 'Value must be greater than 0 and less than 1000' using errcode = '22023';
  end if;
  if p_unit is null or (p_kind = 'weight' and p_unit not in ('kg','lb'))
    or (p_kind <> 'weight' and p_unit not in ('cm','in')) then
    raise exception 'Invalid unit' using errcode = '22023';
  end if;
  if p_kind <> 'weight' and p_unit = 'in' and p_value * 2.54 >= 1000 then
    raise exception 'Measurement must be less than 1000 cm' using errcode = '22023';
  end if;
  if p_recorded_at is null or not isfinite(p_recorded_at) or p_recorded_at < '1900-01-01'::timestamptz
    or p_recorded_at > now() + interval '5 minutes' then
    raise exception 'Invalid entry date' using errcode = '22023';
  end if;
  if p_kind = 'weight' then
    insert into public.weight_entries(user_id, client_id, weight, unit, recorded_at)
      values(v_user, p_client_id, p_value, p_unit, p_recorded_at) returning id into v_id;
  else
    insert into public.measurements(user_id, client_id, measurement_type, value, unit, recorded_at)
      values(v_user, p_client_id, p_kind, p_value, p_unit, p_recorded_at) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Stable keyset pagination; newly inserted rows cannot shift older pages.
create or replace function public.progress_history(
  p_kind text, p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 21
) returns table(id uuid, value numeric, unit text, recorded_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_kind is null or p_kind not in ('weight','chest','waist','hips','left_arm','right_arm','left_thigh','right_thigh') then
    raise exception 'Invalid measurement type' using errcode = '22023';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'Incomplete history cursor'; end if;
  if p_kind = 'weight' then
    return query select e.id, e.weight, e.unit, e.recorded_at from public.weight_entries e
      where e.user_id = (select auth.uid()) and (p_before_at is null or (e.recorded_at, e.id) < (p_before_at, p_before_id))
      order by e.recorded_at desc, e.id desc limit greatest(1, least(coalesce(p_limit, 21), 101));
  else
    return query select e.id, e.value, e.unit, e.recorded_at from public.measurements e
      where e.user_id = (select auth.uid()) and e.measurement_type = p_kind
        and (p_before_at is null or (e.recorded_at, e.id) < (p_before_at, p_before_id))
      order by e.recorded_at desc, e.id desc limit greatest(1, least(coalesce(p_limit, 21), 101));
  end if;
end;
$$;

create or replace function public.progress_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'workout_count', count(*), 'set_count', coalesce(sum(w.set_count), 0),
    'volume_kg', coalesce(sum(w.volume_kg), 0),
    'weights', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, weight as value, unit, recorded_at from public.weight_entries
      where user_id = (select auth.uid()) order by recorded_at desc, id desc limit 2
    ) t)
  ) from public.workouts w where w.user_id = (select auth.uid()) and w.completed_at is not null;
$$;

-- Directly recorded achievements only. Weight is normalized for ranking, but
-- the original load/unit and reps are returned; no estimated 1RM is invented.
create or replace function public.progress_records(p_offset integer default 0, p_limit integer default 21)
returns table(exercise_id uuid, name text, weight numeric, weight_unit text, reps integer, completed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with ranked as (
    select e.exercise_id, c.name, s.weight, s.weight_unit, s.reps, w.completed_at,
      row_number() over (partition by e.exercise_id order by
        round(case when s.weight_unit = 'lb' then s.weight / 2.2046226218 else s.weight end, 4) desc,
        s.reps desc, w.completed_at asc, s.id asc) as rank
    from public.workout_sets s join public.workout_exercises e on e.id = s.workout_exercise_id
      join public.workouts w on w.id = e.workout_id join public.exercises c on c.id = e.exercise_id
    where w.user_id = (select auth.uid()) and w.completed_at is not null and s.completed
  ) select r.exercise_id, r.name, r.weight, r.weight_unit, r.reps, r.completed_at from ranked r
    where r.rank = 1 order by r.name, r.exercise_id
    offset greatest(0, coalesce(p_offset, 0)) limit greatest(1, least(coalesce(p_limit, 21), 101));
$$;

revoke all on function public.log_progress_entry(uuid, text, text, numeric, text, timestamptz) from public, anon;
revoke all on function public.progress_history(text, timestamptz, uuid, integer) from public, anon;
revoke all on function public.progress_overview() from public, anon;
revoke all on function public.progress_records(integer, integer) from public, anon;
grant execute on function public.log_progress_entry(uuid, text, text, numeric, text, timestamptz) to authenticated;
grant execute on function public.progress_history(text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.progress_overview() to authenticated;
grant execute on function public.progress_records(integer, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
