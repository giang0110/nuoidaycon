-- =============================================================================
-- 0001 — Initial schema
--
-- Implements docs/product/PRODUCT_SPEC.md §11 (twelve tables, seven enums).
--
-- Ownership is a single direct chain, with no household or membership
-- indirection (removed in the Phase 0 cleanup):
--
--   auth.users.id = profiles.id
--                 → children.parent_id
--                 → assignments.child_id
--                 → submissions.assignment_id
--                 → submission_assets.submission_id
--
-- Idempotent: safe to re-run against a database that already has it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type public.activity_type as enum (
      'handwriting',
      'drawing_prompt',
      'story_comprehension',
      'story_summary',
      'reflection',
      'situation_judgment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'grade_level') then
    create type public.grade_level as enum (
      'preschool', 'grade_1', 'grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'assignment_status') then
    create type public.assignment_status as enum (
      'assigned', 'in_progress', 'submitted', 'reviewed', 'skipped'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'content_status') then
    create type public.content_status as enum ('draft', 'in_review', 'approved', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_source') then
    create type public.content_source as enum ('seed', 'ai');
  end if;

  if not exists (select 1 from pg_type where typname = 'review_verdict') then
    create type public.review_verdict as enum ('too_easy', 'just_right', 'too_hard');
  end if;

  if not exists (select 1 from pg_type where typname = 'response_mode') then
    create type public.response_mode as enum ('none', 'text', 'choice', 'photo', 'mixed');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles — the parent account, 1:1 with auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text        not null check (length(btrim(display_name)) between 1 and 80),
  locale              text        not null default 'vi' check (locale in ('vi', 'en')),
  child_mode_pin_hash text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'The parent account. Principle P1: the parent owns the account; children are rows, never accounts.';
comment on column public.profiles.child_mode_pin_hash is
  'Hashed child-mode PIN. Child mode is a UX lock, not a security boundary (PRODUCT_SPEC.md §5).';

-- -----------------------------------------------------------------------------
-- children — a child profile. NOT an account.
--
-- Principle P5: birth_year + birth_month only. There is deliberately no
-- date-of-birth column and no age column anywhere in this schema — age is
-- derived at request time and never persisted.
-- -----------------------------------------------------------------------------
create table if not exists public.children (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.profiles (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  birth_year   int  not null check (birth_year between 2000 and 2100),
  birth_month  int  not null check (birth_month between 1 and 12),
  grade        public.grade_level not null,
  avatar_key   text not null default 'default',
  locale       text not null default 'vi' check (locale in ('vi', 'en')),
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.children is
  'A child profile under a parent account. Children have no credentials and no session (decision A7).';
comment on column public.children.birth_month is
  'Month only. Exact date of birth is never collected and age is never persisted (P5, CHILD_SAFETY.md §3).';

-- -----------------------------------------------------------------------------
-- interests — global read-only vocabulary
-- -----------------------------------------------------------------------------
create table if not exists public.interests (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label_vi   text not null,
  label_en   text not null default '',
  sort_order int  not null default 0
);

create table if not exists public.child_interests (
  child_id    uuid not null references public.children (id)  on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  primary key (child_id, interest_id)
);

-- -----------------------------------------------------------------------------
-- activity_templates — the catalog
--
-- `source` and `approved_by_parent_id` are REAL COLUMNS, not fields buried in
-- provenance jsonb, because a database constraint can only defend what the
-- database can see (PRODUCT_SPEC.md §11.3, decision A11).
-- -----------------------------------------------------------------------------
create table if not exists public.activity_templates (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  type                  public.activity_type not null,
  locale                text not null default 'vi' check (locale in ('vi', 'en')),
  title                 text not null check (length(btrim(title)) between 3 and 120),
  instructions          text not null check (length(btrim(instructions)) between 10 and 600),
  min_age               int  not null check (min_age between 3 and 18),
  max_age               int  not null check (max_age between 3 and 18),
  grade_min             public.grade_level not null,
  grade_max             public.grade_level not null,
  difficulty            int  not null check (difficulty between 1 and 5),
  estimated_minutes     int  not null check (estimated_minutes between 3 and 45),
  interest_tags         text[] not null default '{}',
  response_mode         public.response_mode not null,
  payload               jsonb not null,
  status                public.content_status not null default 'draft',
  source                public.content_source not null,
  approved_by_parent_id uuid references public.profiles (id) on delete set null,
  owner_id              uuid references public.profiles (id) on delete cascade,
  schema_version        int  not null default 1 check (schema_version >= 1),
  policy_version        text not null,
  provenance            jsonb not null default '{}'::jsonb,
  version               int  not null default 1 check (version >= 1),
  created_at            timestamptz not null default now(),

  constraint activity_templates_age_range_ck check (min_age <= max_age),

  -- Seed content is global (owner_id null); AI drafts belong to the parent who
  -- requested them.
  constraint activity_templates_seed_is_global_ck
    check (source <> 'seed' or owner_id is null),

  -- Defence-in-depth layer 3 (PRODUCT_SPEC.md §11.3). Brought forward from
  -- Phase 8 because it is a no-op for seed content and closes the gap now:
  -- an AI-sourced template can never be `approved` without a specific parent
  -- having approved it. TypeScript cannot enforce this; the database can.
  constraint activity_templates_ai_requires_parent_approval_ck
    check (
      source <> 'ai'
      or status <> 'approved'
      or approved_by_parent_id is not null
    ),

  -- Seed content is human-reviewed in a pull request, never parent-approved.
  constraint activity_templates_seed_has_no_parent_approval_ck
    check (source <> 'seed' or approved_by_parent_id is null)
);

comment on table public.activity_templates is
  'Curated catalog. Client access is read-only: no INSERT/UPDATE/DELETE privilege is granted to authenticated (PRODUCT_SPEC.md §11.2).';
comment on constraint activity_templates_ai_requires_parent_approval_ck on public.activity_templates is
  'Defence in depth layer 3 (PRODUCT_SPEC.md §11.3): unapproved AI content cannot be marked approved. No AI rows exist before Phase 8; this is a no-op for seed content.';

-- -----------------------------------------------------------------------------
-- child_type_progress — per-child, per-type adaptive difficulty
-- -----------------------------------------------------------------------------
create table if not exists public.child_type_progress (
  child_id         uuid not null references public.children (id) on delete cascade,
  type             public.activity_type not null,
  difficulty       int  not null default 1 check (difficulty between 1 and 5),
  streak_success   int  not null default 0 check (streak_success >= 0),
  streak_struggle  int  not null default 0 check (streak_struggle >= 0),
  last_assigned_at timestamptz,
  primary key (child_id, type)
);

comment on table public.child_type_progress is
  'Difficulty is tracked per child PER ACTIVITY TYPE (decision A6): a child can read well and still be building handwriting.';

-- -----------------------------------------------------------------------------
-- assignments — one activity given to one child
--
-- content_snapshot is an immutable deep copy of the validated activity taken at
-- assign time (decision A5). Editing or archiving the template must never
-- change what a child was given; a trigger below enforces that at write time.
-- -----------------------------------------------------------------------------
create table if not exists public.assignments (
  id                      uuid primary key default gen_random_uuid(),
  child_id                uuid not null references public.children (id) on delete cascade,
  template_id             uuid not null references public.activity_templates (id) on delete restrict,
  assigned_by             uuid not null references public.profiles (id) on delete cascade,
  status                  public.assignment_status not null default 'assigned',
  difficulty_at_assignment int not null check (difficulty_at_assignment between 1 and 5),
  content_snapshot        jsonb not null,
  snapshot_schema_version int  not null default 1 check (snapshot_schema_version >= 1),
  due_on                  date,
  assigned_at             timestamptz not null default now(),
  started_at              timestamptz,
  submitted_at            timestamptz,
  reviewed_at             timestamptz,

  constraint assignments_snapshot_not_empty_ck
    check (jsonb_typeof(content_snapshot) = 'object' and content_snapshot <> '{}'::jsonb)
);

comment on column public.assignments.content_snapshot is
  'Immutable copy of the activity as assigned (decision A5). Enforced by trigger assignments_freeze_snapshot.';

-- -----------------------------------------------------------------------------
-- submissions / submission_assets — the child's work
-- -----------------------------------------------------------------------------
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments (id) on delete cascade,
  answers       jsonb not null default '{}'::jsonb,
  auto_score    jsonb,
  submitted_at  timestamptz not null default now()
);

comment on column public.submissions.auto_score is
  'Server-computed, choice questions only. Free text is never machine-graded (non-goal #12).';

create table if not exists public.submission_assets (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  storage_path  text not null check (length(storage_path) > 0),
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    int  not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at    timestamptz not null default now()
);

comment on table public.submission_assets is
  'Photos of handwriting/drawing. Phase 5 MUST decode and re-encode uploads server-side so EXIF (which carries GPS) is discarded before the asset is stored — client-side stripping is never relied on (CHILD_SAFETY.md §7).';

-- -----------------------------------------------------------------------------
-- assignment_reviews — the parent's verdict, which drives adaptation
-- -----------------------------------------------------------------------------
create table if not exists public.assignment_reviews (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments (id) on delete cascade,
  reviewer_id   uuid not null references public.profiles (id) on delete cascade,
  verdict       public.review_verdict not null,
  note          text check (note is null or length(note) <= 2000),
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- content_reports — a parent flags content
-- -----------------------------------------------------------------------------
create table if not exists public.content_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles (id) on delete cascade,
  template_id   uuid not null references public.activity_templates (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  reason        text not null check (reason in
                  ('unsafe', 'age_inappropriate', 'factually_wrong', 'confusing', 'other')),
  details       text check (details is null or length(details) <= 2000),
  status        text not null default 'open'
                  check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- audit_events — append-only trail
-- -----------------------------------------------------------------------------
create table if not exists public.audit_events (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (length(action) between 1 and 80),
  subject_type text not null check (length(subject_type) between 1 and 40),
  subject_id   uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

comment on table public.audit_events is
  'Actor, action and subject ids only — never content (CHILD_SAFETY.md §3).';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists children_parent_id_idx
  on public.children (parent_id) where archived_at is null;
create index if not exists assignments_child_status_idx
  on public.assignments (child_id, status);
create index if not exists assignments_cooldown_idx
  on public.assignments (child_id, template_id, assigned_at desc);
create index if not exists assignments_assigned_by_idx
  on public.assignments (assigned_by);
create index if not exists activity_templates_lookup_idx
  on public.activity_templates (type, status, locale);
create index if not exists activity_templates_owner_idx
  on public.activity_templates (owner_id) where owner_id is not null;
create index if not exists activity_templates_interest_tags_idx
  on public.activity_templates using gin (interest_tags);
create index if not exists submission_assets_submission_idx
  on public.submission_assets (submission_id);
create index if not exists assignment_reviews_reviewer_idx
  on public.assignment_reviews (reviewer_id);
create index if not exists content_reports_reporter_idx
  on public.content_reports (reporter_id);
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id, created_at desc);
