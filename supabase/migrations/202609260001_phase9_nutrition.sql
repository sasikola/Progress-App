-- Apply the ENTIRE file in Supabase SQL Editor as the project administrator.
-- Adds nutrition/calorie/macro tracking. Additive only; does not touch
-- workouts, profiles, progress, or photos tables.
begin;

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('usda', 'open_food_facts', 'custom')),
  source_food_id text,
  -- Custom foods (future milestone) are private to their creator; provider
  -- foods (usda/open_food_facts) are a shared cache with no owner.
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  brand text,
  barcode text,
  serving_size numeric check (serving_size is null or serving_size > 0),
  serving_unit text check (serving_unit is null or serving_unit in ('g', 'ml', 'oz')),
  -- The "big 4" are required for a food to be usable; a provider item missing
  -- any of them is filtered out at the normalization boundary, not defaulted
  -- to zero. Fiber/sugar/sodium are commonly absent and stay nullable so the
  -- UI can show "unavailable" instead of a fabricated value.
  calories numeric not null check (calories >= 0 and calories <= 5000),
  protein_g numeric not null check (protein_g >= 0 and protein_g <= 1000),
  carbs_g numeric not null check (carbs_g >= 0 and carbs_g <= 1000),
  fat_g numeric not null check (fat_g >= 0 and fat_g <= 1000),
  fiber_g numeric check (fiber_g is null or (fiber_g >= 0 and fiber_g <= 1000)),
  sugar_g numeric check (sugar_g is null or (sugar_g >= 0 and sugar_g <= 1000)),
  sodium_mg numeric check (sodium_mg is null or (sodium_mg >= 0 and sodium_mg <= 100000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A plain (non-partial) unique index: Postgres treats every NULL as
-- distinct for uniqueness, so multiple custom foods with no
-- source_food_id still coexist. It must stay non-partial because the
-- search-foods Edge Function upserts with a plain
-- `ON CONFLICT (source, source_food_id)`, which Postgres can only match
-- to a non-partial unique index/constraint, not a `WHERE source_food_id
-- IS NOT NULL` one (the PostgREST/postgrest-js upsert helper has no way
-- to add that predicate to the conflict target).
drop index if exists public.nutrition_foods_source_key;
create unique index if not exists nutrition_foods_source_key
  on public.foods(source, source_food_id);
create unique index if not exists nutrition_foods_barcode_key
  on public.foods(barcode) where barcode is not null;

create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id),
  client_id text not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  consumed_at timestamptz not null,
  -- Computed on the device from the user's local clock at log time. Grouping
  -- by this column (not a UTC date_trunc of consumed_at) keeps a late-night
  -- entry on the calendar day the user actually experienced it.
  local_date date not null,
  quantity numeric not null check (quantity > 0 and quantity <= 100000),
  unit text not null check (unit in ('g', 'ml', 'oz', 'serving')),
  -- Snapshot of the nutrition used at logging time; never recomputed from the
  -- current foods row so a later catalog correction cannot rewrite history.
  calories numeric not null check (calories >= 0 and calories <= 20000),
  protein_g numeric not null check (protein_g >= 0 and protein_g <= 5000),
  carbs_g numeric not null check (carbs_g >= 0 and carbs_g <= 5000),
  fat_g numeric not null check (fat_g >= 0 and fat_g <= 5000),
  fiber_g numeric check (fiber_g is null or (fiber_g >= 0 and fiber_g <= 5000)),
  sugar_g numeric check (sugar_g is null or (sugar_g >= 0 and sugar_g <= 5000)),
  sodium_mg numeric check (sodium_mg is null or (sodium_mg >= 0 and sodium_mg <= 500000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists nutrition_food_entries_day
  on public.food_entries(user_id, local_date, meal_type, consumed_at);
create index if not exists nutrition_food_entries_history
  on public.food_entries(user_id, consumed_at desc);

create table if not exists public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  calories numeric not null check (calories > 0 and calories <= 10000),
  protein_g numeric not null check (protein_g >= 0 and protein_g <= 2000),
  carbs_g numeric not null check (carbs_g >= 0 and carbs_g <= 2000),
  fat_g numeric not null check (fat_g >= 0 and fat_g <= 2000),
  -- Targets are versioned by date, not edited in place, so a past day's
  -- summary always compares against the target that applied on that day.
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists nutrition_targets_effective
  on public.nutrition_targets(user_id, effective_from desc);

create or replace function public.nutrition_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists nutrition_foods_touch on public.foods;
create trigger nutrition_foods_touch before update on public.foods
  for each row execute function public.nutrition_touch_updated_at();
drop trigger if exists nutrition_food_entries_touch on public.food_entries;
create trigger nutrition_food_entries_touch before update on public.food_entries
  for each row execute function public.nutrition_touch_updated_at();

alter table public.foods enable row level security;
alter table public.food_entries enable row level security;
alter table public.nutrition_targets enable row level security;

-- Provider foods (usda/open_food_facts) are a shared cache readable by any
-- signed-in user. A custom food (future milestone) is visible only to its
-- creator; this restrictive guard applies to every command, not only select.
drop policy if exists nutrition_foods_visibility on public.foods;
create policy nutrition_foods_visibility on public.foods as restrictive for all to authenticated
  using (source <> 'custom' or created_by = (select auth.uid()))
  with check (source <> 'custom' or created_by = (select auth.uid()));
drop policy if exists nutrition_foods_read on public.foods;
create policy nutrition_foods_read on public.foods for select to authenticated using (true);

drop policy if exists nutrition_food_entries_owner_guard on public.food_entries;
create policy nutrition_food_entries_owner_guard on public.food_entries as restrictive for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_food_entries_read on public.food_entries;
create policy nutrition_food_entries_read on public.food_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nutrition_food_entries_insert on public.food_entries;
create policy nutrition_food_entries_insert on public.food_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_food_entries_update on public.food_entries;
create policy nutrition_food_entries_update on public.food_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_food_entries_delete on public.food_entries;
create policy nutrition_food_entries_delete on public.food_entries for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists nutrition_targets_owner_guard on public.nutrition_targets;
create policy nutrition_targets_owner_guard on public.nutrition_targets as restrictive for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_targets_read on public.nutrition_targets;
create policy nutrition_targets_read on public.nutrition_targets for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nutrition_targets_insert on public.nutrition_targets;
create policy nutrition_targets_insert on public.nutrition_targets for insert to authenticated with check ((select auth.uid()) = user_id);

-- No insert/update grant on foods for authenticated: provider foods are
-- cached only by the search-foods Edge Function using the service-role key,
-- which bypasses RLS. Custom-food creation (future milestone) will add a
-- scoped insert policy and grant when that UI ships.
revoke all on public.foods from anon, authenticated;
grant select on public.foods to authenticated;
revoke all on public.food_entries from anon;
grant select, insert, update, delete on public.food_entries to authenticated;
revoke all on public.nutrition_targets from anon;
grant select, insert on public.nutrition_targets to authenticated;

-- SECURITY INVOKER: every read/write below is subject to the caller's RLS.
create or replace function public.log_food_entry(
  p_user_id uuid, p_client_id text, p_food_id uuid, p_meal_type text,
  p_consumed_at timestamptz, p_local_date date, p_quantity numeric, p_unit text,
  p_calories numeric, p_protein_g numeric, p_carbs_g numeric, p_fat_g numeric,
  p_fiber_g numeric default null, p_sugar_g numeric default null, p_sodium_mg numeric default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.food_entries%rowtype;
begin
  if v_user is null or v_user is distinct from p_user_id then
    raise exception 'Account changed; sign in to the entry owner account' using errcode = '42501';
  end if;
  if p_client_id is null or length(p_client_id) not between 8 and 100 then
    raise exception 'Invalid request ID' using errcode = '22023';
  end if;
  -- Serialize retries (including simultaneous requests after a timeout).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('food:' || v_user::text || p_client_id, 0));
  select * into v_entry from public.food_entries where user_id = v_user and client_id = p_client_id;
  if found then return to_jsonb(v_entry); end if;
  if p_meal_type is null or p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'Invalid meal type' using errcode = '22023';
  end if;
  if p_food_id is null or not exists (select 1 from public.foods where id = p_food_id) then
    raise exception 'Food not found' using errcode = '22023';
  end if;
  if p_quantity is null or not (p_quantity > 0 and p_quantity <= 100000) then
    raise exception 'Quantity must be greater than 0' using errcode = '22023';
  end if;
  if p_unit is null or p_unit not in ('g', 'ml', 'oz', 'serving') then
    raise exception 'Invalid unit' using errcode = '22023';
  end if;
  if p_consumed_at is null or not isfinite(p_consumed_at) or p_consumed_at < '1900-01-01'::timestamptz
    or p_consumed_at > now() + interval '5 minutes' then
    raise exception 'Invalid entry time' using errcode = '22023';
  end if;
  if p_local_date is null or p_local_date < '1900-01-01'::date or p_local_date > (now() + interval '1 day')::date then
    raise exception 'Invalid entry date' using errcode = '22023';
  end if;
  if p_calories is null or not (p_calories >= 0 and p_calories <= 20000) then
    raise exception 'Invalid calories' using errcode = '22023';
  end if;
  if p_protein_g is null or p_carbs_g is null or p_fat_g is null
    or p_protein_g < 0 or p_carbs_g < 0 or p_fat_g < 0
    or p_protein_g > 5000 or p_carbs_g > 5000 or p_fat_g > 5000 then
    raise exception 'Invalid macro values' using errcode = '22023';
  end if;
  insert into public.food_entries(
    user_id, client_id, food_id, meal_type, consumed_at, local_date, quantity, unit,
    calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg
  ) values (
    v_user, p_client_id, p_food_id, p_meal_type, p_consumed_at, p_local_date, p_quantity, p_unit,
    p_calories, p_protein_g, p_carbs_g, p_fat_g, p_fiber_g, p_sugar_g, p_sodium_mg
  ) returning * into v_entry;
  return to_jsonb(v_entry);
end;
$$;

create or replace function public.set_nutrition_target(
  p_user_id uuid, p_client_id text, p_calories numeric, p_protein_g numeric,
  p_carbs_g numeric, p_fat_g numeric, p_effective_from date
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_target public.nutrition_targets%rowtype;
begin
  if v_user is null or v_user is distinct from p_user_id then
    raise exception 'Account changed; sign in to the target owner account' using errcode = '42501';
  end if;
  if p_client_id is null or length(p_client_id) not between 8 and 100 then
    raise exception 'Invalid request ID' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nutrition-target:' || v_user::text || p_client_id, 0));
  select * into v_target from public.nutrition_targets where user_id = v_user and client_id = p_client_id;
  if found then return to_jsonb(v_target); end if;
  if p_calories is null or not (p_calories > 0 and p_calories <= 10000) then
    raise exception 'Calories must be greater than 0' using errcode = '22023';
  end if;
  if p_protein_g is null or p_carbs_g is null or p_fat_g is null
    or p_protein_g < 0 or p_carbs_g < 0 or p_fat_g < 0
    or p_protein_g > 2000 or p_carbs_g > 2000 or p_fat_g > 2000 then
    raise exception 'Invalid macro targets' using errcode = '22023';
  end if;
  -- A future effective_from is allowed by design: users can set next month's
  -- target ahead of time (see product spec on versioned nutrition targets).
  if p_effective_from is null or p_effective_from < '1900-01-01'::date then
    raise exception 'Invalid effective date' using errcode = '22023';
  end if;
  insert into public.nutrition_targets(user_id, client_id, calories, protein_g, carbs_g, fat_g, effective_from)
    values (v_user, p_client_id, p_calories, p_protein_g, p_carbs_g, p_fat_g, p_effective_from)
    returning * into v_target;
  return to_jsonb(v_target);
end;
$$;

revoke all on function public.log_food_entry(uuid, text, uuid, text, timestamptz, date, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function public.set_nutrition_target(uuid, text, numeric, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.log_food_entry(uuid, text, uuid, text, timestamptz, date, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.set_nutrition_target(uuid, text, numeric, numeric, numeric, numeric, date) to authenticated;

notify pgrst, 'reload schema';
commit;
