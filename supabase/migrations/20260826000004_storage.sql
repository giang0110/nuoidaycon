-- =============================================================================
-- 0004 — Storage security for submission assets
--
-- Decision A10. Photos of a child's handwriting and drawing are the most
-- sensitive thing this product stores. They live in a PRIVATE bucket and are
-- reached only through short-lived signed URLs — never a public URL, because a
-- public URL of a child's work is permanent once it leaks.
--
-- Path convention (the prefix IS the tenant check):
--
--   submissions/{parent_id}/{child_id}/{submission_id}/{filename}
--
-- so `(storage.foldername(name))[1]` is the owning parent's uid.
--
-- ⚠️ Phase 5 REQUIREMENT — not implemented here, and deliberately so.
-- Uploads MUST be decoded and re-encoded SERVER-SIDE before the final object is
-- written, so EXIF (which routinely carries GPS coordinates, device ids and
-- timestamps) is discarded. Client-side stripping is a bandwidth optimisation
-- and is never relied on: the client is not trusted. See CHILD_SAFETY.md §7.
-- No image-processing code belongs in Phase 2, so none is written here.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,                                              -- private. Never flip this.
  15728640,                                           -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Object policies. Every operation is gated on the first path segment matching
-- the caller's uid, so parent B cannot reach an object under parent A's prefix
-- even if they somehow learn its name.
-- -----------------------------------------------------------------------------
drop policy if exists submissions_objects_select on storage.objects;
drop policy if exists submissions_objects_insert on storage.objects;
drop policy if exists submissions_objects_update on storage.objects;
drop policy if exists submissions_objects_delete on storage.objects;

create policy submissions_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy submissions_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy submissions_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A parent can delete their child's submitted work (approved decision).
create policy submissions_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Hosted Supabase owns storage.objects, so migrations must not issue
-- COMMENT ON TABLE against this managed Storage table.
-- Submission assets remain private and are accessed only through
-- short-lived signed URLs (decision A10).
