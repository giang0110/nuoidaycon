-- =============================================================================
-- 0005 — AI drafts (Phase 8)
--
-- Completes defence-in-depth layer 3 (PRODUCT_SPEC.md §11.3).
--
-- Until now `authenticated` held SELECT on the catalog and nothing else, so
-- there was no way for a client to write content at all. Phase 8 needs parents
-- to own AI drafts, so this grants exactly that much and no more:
--
--   * a parent may create, edit and delete ONLY their own AI drafts
--   * seed content stays unwritable — its owner_id is null, so every policy
--     below fails closed against it
--   * approving requires the approver to BE the owner
--
-- Plus the trigger that makes the whole thing hold even when application code
-- is bypassed: an assignment may not reference an ineligible template.
-- =============================================================================

grant insert, update, delete on public.activity_templates to authenticated;

-- -----------------------------------------------------------------------------
-- Parents own their AI drafts. Note `source = 'ai'` in every check: this
-- privilege can never be used to write a seed row.
-- -----------------------------------------------------------------------------
drop policy if exists activity_templates_own_draft_insert on public.activity_templates;
drop policy if exists activity_templates_own_draft_update on public.activity_templates;
drop policy if exists activity_templates_own_draft_delete on public.activity_templates;

create policy activity_templates_own_draft_insert on public.activity_templates
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and source = 'ai'
    -- A draft is created unapproved. Approval is a separate, deliberate act.
    and status = 'draft'
    and approved_by_parent_id is null
  );

create policy activity_templates_own_draft_update on public.activity_templates
  for update to authenticated
  using (owner_id = (select auth.uid()) and source = 'ai')
  with check (
    owner_id = (select auth.uid())
    and source = 'ai'
    -- Approving requires the approver to be the owner. A parent cannot mark a
    -- draft approved on someone else's behalf, and cannot approve without
    -- recording who did it.
    and (status <> 'approved' or approved_by_parent_id = (select auth.uid()))
  );

create policy activity_templates_own_draft_delete on public.activity_templates
  for delete to authenticated
  using (owner_id = (select auth.uid()) and source = 'ai');

-- -----------------------------------------------------------------------------
-- The assignment eligibility gate.
--
-- assertAssignable() is layer 2 and runs in application code. This is layer 3:
-- it holds when the application is bypassed entirely — a psql session, a
-- migration, a future code path that forgets the guard.
-- -----------------------------------------------------------------------------
create or replace function public.assert_template_assignable()
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

    -- The assigning parent is the child's parent. AI content may only be
    -- assigned by the parent who approved it: one family's approval does not
    -- authorise another's assignment.
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

drop trigger if exists assignments_assert_template_assignable on public.assignments;
create trigger assignments_assert_template_assignable
  before insert on public.assignments
  for each row execute function public.assert_template_assignable();

comment on function public.assert_template_assignable() is
  'Defence in depth layer 3 (PRODUCT_SPEC.md §11.3): unapproved or foreign-approved AI content cannot be assigned, even by SQL that bypasses the application entirely.';

-- -----------------------------------------------------------------------------
-- Generation audit. Every attempt is recorded, including the ones that fail —
-- a rising safety-rejection rate is a signal to fix the prompt template, never
-- to loosen the safety stage (AI_CONTENT_RULES.md §7).
-- -----------------------------------------------------------------------------
create table if not exists public.ai_generation_events (
  id                      uuid primary key default gen_random_uuid(),
  parent_id               uuid not null references public.profiles (id) on delete cascade,
  child_id                uuid references public.children (id) on delete set null,
  activity_type           public.activity_type not null,
  age_band                text not null,
  prompt_template_id      text not null,
  prompt_template_version text not null,
  model                   text not null,
  outcome                 text not null check (outcome in
                            ('generated', 'schema_rejected', 'safety_rejected',
                             'provider_error', 'approved', 'discarded')),
  failure_rules           text[] not null default '{}',
  duration_ms             int,
  created_at              timestamptz not null default now()
);

comment on table public.ai_generation_events is
  'Generation attempts and their outcomes. Parameters and rule ids only — never the generated content, and never anything about the child beyond band and type.';

create index if not exists ai_generation_events_parent_idx
  on public.ai_generation_events (parent_id, created_at desc);

alter table public.ai_generation_events enable row level security;
alter table public.ai_generation_events force row level security;

grant select, insert on public.ai_generation_events to authenticated;

drop policy if exists ai_generation_events_select on public.ai_generation_events;
drop policy if exists ai_generation_events_insert on public.ai_generation_events;

create policy ai_generation_events_select on public.ai_generation_events
  for select to authenticated using (parent_id = (select auth.uid()));
create policy ai_generation_events_insert on public.ai_generation_events
  for insert to authenticated with check (parent_id = (select auth.uid()));
