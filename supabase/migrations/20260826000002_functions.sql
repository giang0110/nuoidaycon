-- =============================================================================
-- 0002 — Functions and triggers
--
-- All functions are `security definer` with a pinned, empty-ish search_path so
-- a caller cannot shadow a referenced object with a temp table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- A parent account gets a profile row automatically.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Phụ huynh')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Every child starts with one progress row per activity type, seeded at the
-- low end of the range. The adaptive engine (Phase 4) moves them from there.
-- -----------------------------------------------------------------------------
create or replace function public.init_child_type_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.child_type_progress (child_id, type, difficulty)
  select new.id, t, 1
  from unnest(enum_range(null::public.activity_type)) as t
  on conflict (child_id, type) do nothing;
  return new;
end;
$$;

drop trigger if exists on_child_created on public.children;
create trigger on_child_created
  after insert on public.children
  for each row execute function public.init_child_type_progress();

-- -----------------------------------------------------------------------------
-- Decision A5: content_snapshot is immutable.
--
-- The application copies the validated activity into the assignment at assign
-- time. Nothing — not a template edit, not a bug, not a stray UPDATE — may
-- change what a child was given afterwards. Enforced here rather than trusted
-- to application code, because the guarantee is worthless if any write path
-- can bypass it.
-- -----------------------------------------------------------------------------
create or replace function public.freeze_assignment_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.content_snapshot is distinct from old.content_snapshot then
    raise exception
      'assignments.content_snapshot is immutable (decision A5): assignment %', old.id
      using errcode = 'restrict_violation';
  end if;

  if new.snapshot_schema_version is distinct from old.snapshot_schema_version then
    raise exception
      'assignments.snapshot_schema_version is immutable (decision A5): assignment %', old.id
      using errcode = 'restrict_violation';
  end if;

  if new.template_id is distinct from old.template_id then
    raise exception
      'assignments.template_id is immutable (decision A5): assignment %', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists assignments_freeze_snapshot on public.assignments;
create trigger assignments_freeze_snapshot
  before update on public.assignments
  for each row execute function public.freeze_assignment_snapshot();

-- -----------------------------------------------------------------------------
-- Ownership helper used by the RLS policies below.
--
-- `security definer` so the policy check itself is not re-filtered by the
-- policies on `children` — that would be circular. It answers exactly one
-- question and leaks nothing else.
-- -----------------------------------------------------------------------------
create or replace function public.owns_child(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.children c
    where c.id = target_child_id
      and c.parent_id = (select auth.uid())
  );
$$;

create or replace function public.owns_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    join public.children c on c.id = a.child_id
    where a.id = target_assignment_id
      and c.parent_id = (select auth.uid())
  );
$$;

create or replace function public.owns_submission(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.children  c on c.id = a.child_id
    where s.id = target_submission_id
      and c.parent_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_child(uuid)      from public, anon;
revoke all on function public.owns_assignment(uuid) from public, anon;
revoke all on function public.owns_submission(uuid) from public, anon;
grant execute on function public.owns_child(uuid)      to authenticated;
grant execute on function public.owns_assignment(uuid) to authenticated;
grant execute on function public.owns_submission(uuid) to authenticated;
