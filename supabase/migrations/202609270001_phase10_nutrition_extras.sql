-- Apply the ENTIRE file in Supabase SQL Editor as the project administrator.
-- Apply AFTER 202609260001_phase9_nutrition.sql. Additive: recent foods,
-- favorite foods, and custom food creation. Does not touch food_entries,
-- nutrition_targets, or any other phase's tables.
begin;

create table if not exists public.favorite_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, food_id)
);
create index if not exists nutrition_favorite_foods_user
  on public.favorite_foods(user_id, created_at desc);

alter table public.favorite_foods enable row level security;
drop policy if exists nutrition_favorite_foods_owner_guard on public.favorite_foods;
create policy nutrition_favorite_foods_owner_guard on public.favorite_foods as restrictive for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_favorite_foods_read on public.favorite_foods;
create policy nutrition_favorite_foods_read on public.favorite_foods for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nutrition_favorite_foods_insert on public.favorite_foods;
create policy nutrition_favorite_foods_insert on public.favorite_foods for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_favorite_foods_delete on public.favorite_foods;
create policy nutrition_favorite_foods_delete on public.favorite_foods for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.favorite_foods from anon;
grant select, insert, delete on public.favorite_foods to authenticated;

-- Custom foods: a user may create their own food, private to them (enforced
-- by the phase 9 nutrition_foods_visibility restrictive policy already in
-- place). This is the only new write path onto `foods` for authenticated
-- clients; provider rows (usda/open_food_facts) remain writable only by the
-- Edge Functions' service-role key.
drop policy if exists nutrition_foods_custom_insert on public.foods;
create policy nutrition_foods_custom_insert on public.foods for insert to authenticated
  with check (source = 'custom' and created_by = (select auth.uid()));
grant insert on public.foods to authenticated;

-- Distinct foods the caller has actually logged, most recently used first.
-- Returns full food rows (not just IDs) so the client can render results
-- without a second round trip, exactly like search-foods' response shape.
create or replace function public.recent_foods(p_limit integer default 10)
returns table(
  id uuid, source text, source_food_id text, name text, brand text, barcode text,
  serving_size numeric, serving_unit text, calories numeric, protein_g numeric,
  carbs_g numeric, fat_g numeric, fiber_g numeric, sugar_g numeric, sodium_mg numeric
) language sql stable security invoker set search_path = '' as $$
  select f.id, f.source, f.source_food_id, f.name, f.brand, f.barcode,
    f.serving_size, f.serving_unit, f.calories, f.protein_g, f.carbs_g, f.fat_g,
    f.fiber_g, f.sugar_g, f.sodium_mg
  from public.food_entries e
  join public.foods f on f.id = e.food_id
  where e.user_id = (select auth.uid())
  group by f.id
  order by max(e.consumed_at) desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
revoke all on function public.recent_foods(integer) from public, anon;
grant execute on function public.recent_foods(integer) to authenticated;

notify pgrst, 'reload schema';
commit;
