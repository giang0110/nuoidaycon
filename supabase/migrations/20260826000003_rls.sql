-- =============================================================================
-- 0003 — Row Level Security
--
-- RLS is THE authorisation boundary (decision A2). A bug in a route handler
-- must not be able to leak another family's data.
--
-- Two separate mechanisms are used together:
--
--   1. PRIVILEGES decide what an operation is even possible. `anon` gets
--      nothing at all; `authenticated` gets SELECT on the catalog and full DML
--      only on tenant tables. This is what makes the curated catalog read-only
--      for clients (PRODUCT_SPEC.md §11.2) — not a policy that could be
--      loosened by accident.
--
--   2. POLICIES then narrow each of those operations to the caller's own rows.
--
-- Deny by default: RLS is enabled everywhere, and a table with no matching
-- policy returns nothing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privileges — revoke everything, then grant back deliberately.
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;

-- anon gets nothing. Unauthenticated access to application data is zero.

-- Read-only reference data.
grant select on public.interests          to authenticated;
grant select on public.activity_templates to authenticated;

-- Tenant tables: full DML, narrowed to own rows by the policies below.
grant select, insert, update, delete on public.profiles            to authenticated;
grant select, insert, update, delete on public.children            to authenticated;
grant select, insert, update, delete on public.child_interests     to authenticated;
grant select, insert, update, delete on public.child_type_progress to authenticated;
grant select, insert, update, delete on public.assignments         to authenticated;
grant select, insert, update, delete on public.submissions         to authenticated;
grant select, insert, update, delete on public.submission_assets   to authenticated;
grant select, insert, update, delete on public.assignment_reviews  to authenticated;
grant select, insert, update, delete on public.content_reports     to authenticated;

-- Append-only trail: readable by its owner, never rewritten by a client.
grant select, insert on public.audit_events to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table.
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.children            enable row level security;
alter table public.interests           enable row level security;
alter table public.child_interests     enable row level security;
alter table public.activity_templates  enable row level security;
alter table public.child_type_progress enable row level security;
alter table public.assignments         enable row level security;
alter table public.submissions         enable row level security;
alter table public.submission_assets   enable row level security;
alter table public.assignment_reviews  enable row level security;
alter table public.content_reports     enable row level security;
alter table public.audit_events        enable row level security;

-- -----------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY — selectively, with a stated reason each time.
--
-- FORCE removes the TABLE OWNER's exemption from its own policies. It is worth
-- having where no legitimate owner-role write path exists, and actively harmful
-- where one does, because it breaks migrations, triggers and the seed loader
-- while adding nothing against the real threat (a compromised anon or
-- authenticated client, already fully constrained by ordinary RLS).
--
-- NOTE: `service_role` carries BYPASSRLS, so neither ENABLE nor FORCE
-- constrains it. FORCE is NOT a defence against a leaked service-role key —
-- decision A3 (keep that key out of every request path) is.
--
-- See PRODUCT_SPEC.md §11.2 for the full table-by-table rationale.
-- -----------------------------------------------------------------------------
alter table public.submissions        force row level security;
alter table public.submission_assets  force row level security;
alter table public.assignment_reviews force row level security;
alter table public.content_reports    force row level security;

comment on table public.submissions is
  'FORCE RLS: holds child work; no migration, trigger or seed path writes here, so the owner should not be exempt.';
comment on table public.assignment_reviews is
  'FORCE RLS: a parent''s private notes about a child; no owner-role write path exists.';
comment on table public.content_reports is
  'FORCE RLS: user-submitted reports; owner exemption would add nothing.';

-- Deliberately NOT forced (a trigger, migration or the seed loader writes them
-- as owner): profiles, children, assignments, child_interests,
-- child_type_progress, activity_templates, interests, audit_events.

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

-- profiles: you are your own row.
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

-- children: direct ownership, no join.
drop policy if exists children_select on public.children;
drop policy if exists children_insert on public.children;
drop policy if exists children_update on public.children;
drop policy if exists children_delete on public.children;

create policy children_select on public.children
  for select to authenticated using (parent_id = (select auth.uid()));
create policy children_insert on public.children
  for insert to authenticated with check (parent_id = (select auth.uid()));
create policy children_update on public.children
  for update to authenticated
  using (parent_id = (select auth.uid())) with check (parent_id = (select auth.uid()));
create policy children_delete on public.children
  for delete to authenticated using (parent_id = (select auth.uid()));

-- interests: global read-only lookup.
drop policy if exists interests_select on public.interests;
create policy interests_select on public.interests
  for select to authenticated using (true);

-- child_interests: one hop.
drop policy if exists child_interests_select on public.child_interests;
drop policy if exists child_interests_insert on public.child_interests;
drop policy if exists child_interests_update on public.child_interests;
drop policy if exists child_interests_delete on public.child_interests;

create policy child_interests_select on public.child_interests
  for select to authenticated using (public.owns_child(child_id));
create policy child_interests_insert on public.child_interests
  for insert to authenticated with check (public.owns_child(child_id));
create policy child_interests_update on public.child_interests
  for update to authenticated
  using (public.owns_child(child_id)) with check (public.owns_child(child_id));
create policy child_interests_delete on public.child_interests
  for delete to authenticated using (public.owns_child(child_id));

-- child_type_progress: one hop.
drop policy if exists child_type_progress_select on public.child_type_progress;
drop policy if exists child_type_progress_insert on public.child_type_progress;
drop policy if exists child_type_progress_update on public.child_type_progress;
drop policy if exists child_type_progress_delete on public.child_type_progress;

create policy child_type_progress_select on public.child_type_progress
  for select to authenticated using (public.owns_child(child_id));
create policy child_type_progress_insert on public.child_type_progress
  for insert to authenticated with check (public.owns_child(child_id));
create policy child_type_progress_update on public.child_type_progress
  for update to authenticated
  using (public.owns_child(child_id)) with check (public.owns_child(child_id));
create policy child_type_progress_delete on public.child_type_progress
  for delete to authenticated using (public.owns_child(child_id));

-- activity_templates: read-only for clients. Approved global content is visible
-- to any authenticated parent; a parent's own draft (Phase 8) is private to
-- them. There is no INSERT/UPDATE/DELETE policy because no such privilege is
-- granted — writes belong to the seed loader running as owner.
drop policy if exists activity_templates_select on public.activity_templates;
create policy activity_templates_select on public.activity_templates
  for select to authenticated
  using (
    (owner_id is null and status = 'approved')
    or owner_id = (select auth.uid())
  );

-- assignments: one hop. `assigned_by` must also be the caller, so a parent
-- cannot attribute an assignment to someone else.
drop policy if exists assignments_select on public.assignments;
drop policy if exists assignments_insert on public.assignments;
drop policy if exists assignments_update on public.assignments;
drop policy if exists assignments_delete on public.assignments;

create policy assignments_select on public.assignments
  for select to authenticated using (public.owns_child(child_id));
create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (public.owns_child(child_id) and assigned_by = (select auth.uid()));
create policy assignments_update on public.assignments
  for update to authenticated
  using (public.owns_child(child_id)) with check (public.owns_child(child_id));
create policy assignments_delete on public.assignments
  for delete to authenticated using (public.owns_child(child_id));

-- submissions: two hops.
drop policy if exists submissions_select on public.submissions;
drop policy if exists submissions_insert on public.submissions;
drop policy if exists submissions_update on public.submissions;
drop policy if exists submissions_delete on public.submissions;

create policy submissions_select on public.submissions
  for select to authenticated using (public.owns_assignment(assignment_id));
create policy submissions_insert on public.submissions
  for insert to authenticated with check (public.owns_assignment(assignment_id));
create policy submissions_update on public.submissions
  for update to authenticated
  using (public.owns_assignment(assignment_id))
  with check (public.owns_assignment(assignment_id));
-- A parent can delete their child's submissions (approved decision, Phase 0 §3).
create policy submissions_delete on public.submissions
  for delete to authenticated using (public.owns_assignment(assignment_id));

-- submission_assets: three hops.
drop policy if exists submission_assets_select on public.submission_assets;
drop policy if exists submission_assets_insert on public.submission_assets;
drop policy if exists submission_assets_update on public.submission_assets;
drop policy if exists submission_assets_delete on public.submission_assets;

create policy submission_assets_select on public.submission_assets
  for select to authenticated using (public.owns_submission(submission_id));
create policy submission_assets_insert on public.submission_assets
  for insert to authenticated with check (public.owns_submission(submission_id));
create policy submission_assets_update on public.submission_assets
  for update to authenticated
  using (public.owns_submission(submission_id))
  with check (public.owns_submission(submission_id));
create policy submission_assets_delete on public.submission_assets
  for delete to authenticated using (public.owns_submission(submission_id));

-- assignment_reviews: one hop through the assignment, and the reviewer must be
-- the caller.
drop policy if exists assignment_reviews_select on public.assignment_reviews;
drop policy if exists assignment_reviews_insert on public.assignment_reviews;
drop policy if exists assignment_reviews_update on public.assignment_reviews;
drop policy if exists assignment_reviews_delete on public.assignment_reviews;

create policy assignment_reviews_select on public.assignment_reviews
  for select to authenticated using (public.owns_assignment(assignment_id));
create policy assignment_reviews_insert on public.assignment_reviews
  for insert to authenticated
  with check (public.owns_assignment(assignment_id) and reviewer_id = (select auth.uid()));
create policy assignment_reviews_update on public.assignment_reviews
  for update to authenticated
  using (public.owns_assignment(assignment_id))
  with check (public.owns_assignment(assignment_id) and reviewer_id = (select auth.uid()));
create policy assignment_reviews_delete on public.assignment_reviews
  for delete to authenticated using (public.owns_assignment(assignment_id));

-- content_reports: owned by the reporting parent.
drop policy if exists content_reports_select on public.content_reports;
drop policy if exists content_reports_insert on public.content_reports;
drop policy if exists content_reports_update on public.content_reports;
drop policy if exists content_reports_delete on public.content_reports;

create policy content_reports_select on public.content_reports
  for select to authenticated using (reporter_id = (select auth.uid()));
create policy content_reports_insert on public.content_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy content_reports_update on public.content_reports
  for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));
create policy content_reports_delete on public.content_reports
  for delete to authenticated using (reporter_id = (select auth.uid()));

-- audit_events: a parent may read and append their own trail. No UPDATE or
-- DELETE policy exists, and no such privilege is granted — the trail is
-- append-only by construction.
drop policy if exists audit_events_select on public.audit_events;
drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated using (actor_id = (select auth.uid()));
create policy audit_events_insert on public.audit_events
  for insert to authenticated with check (actor_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Future tables must not silently default to permissive.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
