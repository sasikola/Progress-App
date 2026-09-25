-- Reproduces the column metadata supplied by the user. These are test records
-- in an isolated database, never a fixture to apply to the real project.
-- Deliberately no unique exercise-name or workout/exercise-pair constraints:
-- the user's column metadata did not establish that those constraints exist.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  equipment text,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  category text not null default 'General'
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default now()
);
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id),
  exercise_id uuid not null references public.exercises(id),
  order_index integer not null,
  created_at timestamptz not null default now()
);
insert into public.exercises (id, name, muscle_group, equipment, is_default, created_at) values
  ('10000000-0000-4000-8000-000000000001', 'Legacy Row', 'Back', 'Cable', false, '2025-01-01Z'),
  ('10000000-0000-4000-8000-000000000002', 'Legacy Row', 'Back', 'Dumbbell', false, '2025-01-02Z'),
  ('10000000-0000-4000-8000-000000000003', 'Squat', 'Legs', 'Barbell', true, '2025-01-03Z');
insert into public.workouts (id, user_id, name, started_at, completed_at, notes) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'Original session name', '2025-01-01T10:00:00Z', '2025-01-01T10:30:00Z', 'Keep these notes'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'Unfinished old session', '2025-01-02T10:00:00Z', null, 'Do not mark complete'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'Historical clock mismatch', '2025-01-03T10:00:00Z', '2025-01-03T09:00:00Z', 'Do not rewrite timestamps');
insert into public.workout_exercises (id, workout_id, exercise_id, order_index) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 0);
