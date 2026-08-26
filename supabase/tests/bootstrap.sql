-- =============================================================================
-- LOCAL TEST BOOTSTRAP — NOT A MIGRATION. NEVER RUN AGAINST A REAL DATABASE.
--
-- A hosted Supabase project already provides the `auth` and `storage` schemas,
-- the `anon` / `authenticated` / `service_role` roles, `auth.uid()` and
-- `storage.foldername()`. A vanilla PostgreSQL used for testing does not, so
-- this file recreates just enough of them for the RLS matrix to exercise the
-- real policies.
--
-- It is deliberately kept OUT of supabase/migrations/ so it can never be
-- applied to a project. The migrations under test are unchanged by it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles, matching Supabase's setup.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- Mirrors production: service_role carries BYPASSRLS. This is exactly why
  -- FORCE RLS is not a defence against a leaked service-role key, and why
  -- decision A3 keeps that key out of every request path.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists storage;

grant usage on schema public  to anon, authenticated, service_role;
grant usage on schema auth    to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- auth.users — only the columns the application touches.
-- -----------------------------------------------------------------------------
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- auth.uid() — reads the request's JWT claims, as in production. Tests set the
-- claims with `set local request.jwt.claims = '{"sub":"<uuid>"}'`.
-- -----------------------------------------------------------------------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- storage.buckets / storage.objects / storage.foldername()
-- -----------------------------------------------------------------------------
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

revoke all on storage.objects from anon, authenticated;
revoke all on storage.buckets from anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
