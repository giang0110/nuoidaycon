/**
 * Storage security — decision A10.
 *
 * The submissions bucket is private, and the FIRST PATH SEGMENT is the tenant
 * check: `submissions/{parent_id}/{child_id}/{submission_id}/{file}`. Parent B
 * must not reach an object under parent A's prefix even knowing its exact name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import {
  hasDatabase,
  connectAdmin,
  applySchema,
  asParent,
  asAnon,
  seedTenant,
  type Tenant,
} from './helpers/db';

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('storage security', () => {
  let db: Client;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    A = await seedTenant(db, 'store-a');
    B = await seedTenant(db, 'store-b');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  it('keeps the submissions bucket private', async () => {
    const r = await db.query<{ public: boolean; allowed_mime_types: string[] }>(
      `select public, allowed_mime_types from storage.buckets where id = 'submissions'`,
    );
    expect(r.rowCount).toBe(1);
    const bucket = r.rows[0];
    expect(bucket, 'the submissions bucket must exist').toBeDefined();
    expect(bucket?.public, 'the submissions bucket must never be public').toBe(false);
    expect(bucket?.allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('lets a parent read their own object', async () => {
    const r = await asParent(db, A.parentId, `select name from storage.objects where name = $1`, [
      A.storagePath,
    ]);
    expect(r.rowCount).toBe(1);
  });

  it('denies parent B read of parent A objects, even by exact name', async () => {
    const r = await asParent(db, B.parentId, `select name from storage.objects where name = $1`, [
      A.storagePath,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it('denies parent B write under parent A prefix', async () => {
    const forged = `${A.parentId}/${A.childId}/${A.submissionId}/forged.jpg`;
    const r = await asParent(
      db,
      B.parentId,
      `insert into storage.objects (bucket_id, name) values ('submissions', $1)`,
      [forged],
    );
    expect(r.error, 'insert under another parent prefix must be rejected').toBeDefined();
  });

  it('denies parent B update and delete of parent A objects', async () => {
    const update = await asParent(
      db,
      B.parentId,
      `update storage.objects set name = 'moved.jpg' where name = $1`,
      [A.storagePath],
    );
    expect(update.rowCount).toBe(0);

    const del = await asParent(db, B.parentId, `delete from storage.objects where name = $1`, [
      A.storagePath,
    ]);
    expect(del.rowCount).toBe(0);

    const still = await db.query(`select name from storage.objects where name = $1`, [
      A.storagePath,
    ]);
    expect(still.rowCount).toBe(1);
  });

  it('lets a parent delete their own object (approved capability)', async () => {
    const own = await seedTenant(db, 'store-del');
    const r = await asParent(db, own.parentId, `delete from storage.objects where name = $1`, [
      own.storagePath,
    ]);
    expect(r.error).toBeUndefined();
    expect(r.rowCount).toBe(1);
  });

  it('denies anonymous access entirely', async () => {
    const r = await asAnon(db, `select name from storage.objects where name = $1`, [A.storagePath]);
    const denied = r.error !== undefined || r.rowCount === 0;
    expect(denied).toBe(true);
  });

  it('uses the parent-id-first path convention', () => {
    expect(A.storagePath.split('/')[0]).toBe(A.parentId);
    expect(A.storagePath.split('/')).toHaveLength(4);
  });

  it('documents the Phase 5 server-side EXIF requirement in the migration', async () => {
    // The requirement must survive as an executable-adjacent artefact, not
    // just a note in a doc nobody opens while writing the upload path.
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/20260826000004_storage.sql', 'utf8');
    expect(sql).toMatch(/EXIF/);
    expect(sql).toMatch(/SERVER-SIDE/i);
  });
});
