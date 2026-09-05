-- =============================================================================
-- Harden SECURITY DEFINER functions against Data API RPC exposure.
--
-- Supabase/Postgres grants EXECUTE on new functions to PUBLIC by default. The
-- original privileged helpers lived in the exposed `public` schema, so trigger
-- functions were callable through RPC and the RLS helpers were directly
-- addressable by authenticated clients. Keep the same database behaviour while
-- moving privileged code into a non-exposed schema.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger functions: internal only. No client role receives EXECUTE.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
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

create or replace function private.init_child_type_progress()
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

create or replace function private.assert_template_assignable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tpl record;
  assigning_parent uuid;
begin
  select t.status, t.source, t.owner_id, t.approved_by_parent_id
    into tpl
    from public.activity_templates t
   where t.id = new.template_id;

  if not found then
    raise exception 'assignment references a template that does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if tpl.status <> 'approved' then
    raise exception
      'only approved content may be assigned (template % is %)', new.template_id, tpl.status
      using errcode = 'restrict_violation';
  end if;

  if tpl.source = 'ai' then
    if tpl.approved_by_parent_id is null then
      raise exception
        'AI content requires an explicit parent approval before assignment (template %)',
        new.template_id
        using errcode = 'restrict_violation';
    end if;

    select c.parent_id into assigning_parent
      from public.children c where c.id = new.child_id;

    if tpl.approved_by_parent_id is distinct from assigning_parent then
      raise exception
        'AI content may only be assigned by the parent who approved it (template %)',
        new.template_id
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.init_child_type_progress() from public, anon, authenticated;
revoke all on function private.assert_template_assignable() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS ownership helpers: callable by authenticated because policies execute as
-- the caller, but kept out of the exposed API schema. Anon gets nothing.
-- -----------------------------------------------------------------------------
create or replace function private.owns_child(target_child_id uuid)
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

create or replace function private.owns_assignment(target_assignment_id uuid)
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

create or replace function private.owns_submission(target_submission_id uuid)
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
    join public.children c on c.id = a.child_id
    where s.id = target_submission_id
      and c.parent_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_child(uuid) from public, anon, authenticated;
revoke all on function private.owns_assignment(uuid) from public, anon, authenticated;
revoke all on function private.owns_submission(uuid) from public, anon, authenticated;
grant execute on function private.owns_child(uuid) to authenticated;
grant execute on function private.owns_assignment(uuid) to authenticated;
grant execute on function private.owns_submission(uuid) to authenticated;

-- Repoint triggers before removing the exposed copies.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists on_child_created on public.children;
create trigger on_child_created
  after insert on public.children
  for each row execute function private.init_child_type_progress();

drop trigger if exists assignments_assert_template_assignable on public.assignments;
create trigger assignments_assert_template_assignable
  before insert on public.assignments
  for each row execute function private.assert_template_assignable();

-- Repoint every policy that depends on an ownership helper.
alter policy child_interests_select on public.child_interests
  using (private.owns_child(child_id));
alter policy child_interests_insert on public.child_interests
  with check (private.owns_child(child_id));
alter policy child_interests_update on public.child_interests
  using (private.owns_child(child_id))
  with check (private.owns_child(child_id));
alter policy child_interests_delete on public.child_interests
  using (private.owns_child(child_id));

alter policy child_type_progress_select on public.child_type_progress
  using (private.owns_child(child_id));
alter policy child_type_progress_insert on public.child_type_progress
  with check (private.owns_child(child_id));
alter policy child_type_progress_update on public.child_type_progress
  using (private.owns_child(child_id))
  with check (private.owns_child(child_id));
alter policy child_type_progress_delete on public.child_type_progress
  using (private.owns_child(child_id));

alter policy assignments_select on public.assignments
  using (private.owns_child(child_id));
alter policy assignments_insert on public.assignments
  with check (private.owns_child(child_id) and assigned_by = (select auth.uid()));
alter policy assignments_update on public.assignments
  using (private.owns_child(child_id))
  with check (private.owns_child(child_id));
alter policy assignments_delete on public.assignments
  using (private.owns_child(child_id));

alter policy submissions_select on public.submissions
  using (private.owns_assignment(assignment_id));
alter policy submissions_insert on public.submissions
  with check (private.owns_assignment(assignment_id));
alter policy submissions_update on public.submissions
  using (private.owns_assignment(assignment_id))
  with check (private.owns_assignment(assignment_id));
alter policy submissions_delete on public.submissions
  using (private.owns_assignment(assignment_id));

alter policy submission_assets_select on public.submission_assets
  using (private.owns_submission(submission_id));
alter policy submission_assets_insert on public.submission_assets
  with check (private.owns_submission(submission_id));
alter policy submission_assets_update on public.submission_assets
  using (private.owns_submission(submission_id))
  with check (private.owns_submission(submission_id));
alter policy submission_assets_delete on public.submission_assets
  using (private.owns_submission(submission_id));

alter policy assignment_reviews_select on public.assignment_reviews
  using (private.owns_assignment(assignment_id));
alter policy assignment_reviews_insert on public.assignment_reviews
  with check (
    private.owns_assignment(assignment_id)
    and reviewer_id = (select auth.uid())
  );
alter policy assignment_reviews_update on public.assignment_reviews
  using (private.owns_assignment(assignment_id))
  with check (
    private.owns_assignment(assignment_id)
    and reviewer_id = (select auth.uid())
  );
alter policy assignment_reviews_delete on public.assignment_reviews
  using (private.owns_assignment(assignment_id));

-- Remove the exposed SECURITY DEFINER copies after all dependencies moved.
drop function if exists public.owns_child(uuid);
drop function if exists public.owns_assignment(uuid);
drop function if exists public.owns_submission(uuid);
drop function if exists public.handle_new_user();
drop function if exists public.init_child_type_progress();
drop function if exists public.assert_template_assignable();

comment on schema private is
  'Privileged database helpers. Not exposed by Supabase Data API; client roles receive only the minimum EXECUTE needed by RLS policies.';
