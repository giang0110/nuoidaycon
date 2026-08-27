/**
 * Submission retry / idempotency regression coverage.
 *
 * The staging bug: submitting the same assignment twice raised
 * `duplicate key value violates unique constraint "submissions_assignment_id_key"`
 * at the child. `submissions.assignment_id` is UNIQUE and the action inserted
 * unconditionally.
 *
 * These tests drive the flow through in-memory ports, so the ordering and the
 * idempotency rules are pinned without needing a database. The RLS-level
 * guarantees stay covered by tests/integration.
 */
import { describe, it, expect } from 'vitest';
import { runSubmission, type SubmitPorts, type SubmitInput } from '@/lib/submissions/submit-flow';
import { buildStoragePath } from '@/lib/media/sanitise-image';
import type { AssignmentStatus } from '@/lib/domain/entities';
import { comprehensionFixture, handwritingFixture } from '@/tests/fixtures/activities';

const PARENT = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT = '33333333-3333-4333-8333-333333333333';

interface AssetRow {
  submissionId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * A stand-in for the database and the bucket. Deliberately dumb: it models the
 * one thing the real schema enforces — a single submission per assignment — and
 * otherwise records what happened, so a test can assert on call ORDER as well
 * as on final state.
 */
function createHarness(options: { snapshot?: unknown; overrides?: Partial<SubmitPorts> } = {}): {
  ports: SubmitPorts;
  state: HarnessState;
} {
  const state: HarnessState = {
    assignmentStatus: 'assigned',
    snapshot: options.snapshot ?? handwritingFixture,
    submissions: [],
    assets: [],
    objects: new Map(),
    audit: [],
    calls: [],
  };

  let nextId = 1;

  const ports: SubmitPorts = {
    parentId: PARENT,

    async findAssignment(assignmentId) {
      state.calls.push('findAssignment');
      if (assignmentId !== ASSIGNMENT) return null;
      return {
        id: ASSIGNMENT,
        childId: CHILD,
        status: state.assignmentStatus,
        contentSnapshot: state.snapshot,
      };
    },

    async upsertSubmission({ assignmentId, answers, autoScore }) {
      state.calls.push('upsertSubmission');
      const existing = state.submissions.find((s) => s.assignmentId === assignmentId);
      if (existing) {
        // The real statement is INSERT ... ON CONFLICT DO UPDATE, so a retry
        // refreshes the answers rather than raising 23505.
        existing.answers = answers;
        existing.autoScore = autoScore;
        return { id: existing.id };
      }
      const created = { id: `sub-${nextId++}`, assignmentId, answers, autoScore };
      state.submissions.push(created);
      return { id: created.id };
    },

    async listAssetPaths(submissionId) {
      state.calls.push('listAssetPaths');
      return state.assets.filter((a) => a.submissionId === submissionId).map((a) => a.storagePath);
    },

    async replaceAssets(submissionId, rows) {
      state.calls.push('replaceAssets');
      state.assets = state.assets.filter((a) => a.submissionId !== submissionId);
      state.assets.push(...rows.map((r) => ({ submissionId, ...r })));
    },

    async sanitise(raw) {
      state.calls.push('sanitise');
      return {
        ok: true,
        data: raw,
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
        bytes: raw.byteLength,
      };
    },

    async upload(path, data) {
      state.calls.push('upload');
      state.objects.set(path, data);
      return { ok: true };
    },

    async removeObjects(paths) {
      state.calls.push('removeObjects');
      for (const p of paths) state.objects.delete(p);
    },

    async markSubmitted(assignmentId) {
      state.calls.push('markSubmitted');
      if (assignmentId === ASSIGNMENT) state.assignmentStatus = 'submitted';
    },

    async appendAudit(event) {
      state.calls.push('appendAudit');
      state.audit.push({ action: event.action, subjectId: event.subjectId });
    },

    ...options.overrides,
  };

  return { ports, state };
}

interface HarnessState {
  assignmentStatus: AssignmentStatus;
  snapshot: unknown;
  submissions: { id: string; assignmentId: string; answers: unknown; autoScore: unknown }[];
  assets: AssetRow[];
  objects: Map<string, Buffer>;
  audit: { action: string; subjectId: string | null }[];
  calls: string[];
}

const NO_ANSWERS = { text: {}, choice: {} };

/** Correct answers for the comprehension fixture, read off the snapshot. */
function comprehensionAnswers(): SubmitInput['answers'] {
  const text: Record<string, string> = {};
  const choice: Record<string, string> = {};
  if (comprehensionFixture.type !== 'story_comprehension') throw new Error('fixture changed type');
  for (const q of comprehensionFixture.payload.questions) {
    if (q.kind === 'multiple_choice') choice[q.id] = q.choices[0]!.id;
    else text[q.id] = 'Con trả lời câu này.';
  }
  return { text, choice };
}

function photo(byte: number): { bytes: Buffer; mimeType: string } {
  return { bytes: Buffer.from([byte, byte, byte]), mimeType: 'image/jpeg' };
}

function pathFor(index: number, submissionId = 'sub-1'): string {
  return buildStoragePath({ parentId: PARENT, childId: CHILD, submissionId, index });
}

describe('first submission', () => {
  it('creates the submission, stores the photo and marks the assignment submitted', async () => {
    const { ports, state } = createHarness();

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(outcome.status).toBe('submitted');
    expect(state.submissions).toHaveLength(1);
    expect(state.assets).toHaveLength(1);
    expect(state.assignmentStatus).toBe('submitted');
    expect(state.audit).toEqual([{ action: 'submit', subjectId: 'sub-1' }]);
  });

  it('writes each photo to the deterministic path for its index', async () => {
    const { ports, state } = createHarness();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1), photo(2)],
    });

    const expected = [pathFor(0), pathFor(1)].sort();
    expect([...state.objects.keys()].sort()).toEqual(expected);
    expect(state.assets.map((a) => a.storagePath).sort()).toEqual(expected);
  });

  it('sanitises every photo before it is uploaded', async () => {
    const { ports, state } = createHarness();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    // EXIF stripping is not optional and not reorderable: the bytes that reach
    // the bucket must be the re-encoded ones.
    expect(state.calls.indexOf('sanitise')).toBeLessThan(state.calls.indexOf('upload'));
  });

  it('scores the choice questions against the stored snapshot', async () => {
    const { ports, state } = createHarness({ snapshot: comprehensionFixture });

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: comprehensionAnswers(),
      photos: [],
    });

    expect(state.submissions[0]!.autoScore).toMatchObject({ correct: 1, total: 1 });
  });
});

describe('repeat submit of a completed assignment is idempotent', () => {
  for (const status of ['submitted', 'reviewed'] as const) {
    it(`returns already_submitted without touching anything (status=${status})`, async () => {
      const { ports, state } = createHarness();
      state.assignmentStatus = status;
      state.submissions.push({
        id: 'sub-existing',
        assignmentId: ASSIGNMENT,
        answers: {},
        autoScore: null,
      });

      const outcome = await runSubmission(ports, {
        assignmentId: ASSIGNMENT,
        answers: NO_ANSWERS,
        photos: [photo(9)],
      });

      expect(outcome.status).toBe('already_submitted');
      expect(state.submissions).toHaveLength(1);
      // Short-circuits before any expensive or destructive work.
      expect(state.calls).not.toContain('upsertSubmission');
      expect(state.calls).not.toContain('sanitise');
      expect(state.calls).not.toContain('upload');
      expect(state.calls).not.toContain('replaceAssets');
      expect(state.objects.size).toBe(0);
    });
  }

  it('does not re-append an audit event for a repeat submit', async () => {
    const { ports, state } = createHarness();
    state.assignmentStatus = 'submitted';

    await runSubmission(ports, { assignmentId: ASSIGNMENT, answers: NO_ANSWERS, photos: [] });

    expect(state.audit).toHaveLength(0);
  });

  it('never surfaces a raw duplicate-key error to the caller', async () => {
    const { ports, state } = createHarness();
    state.assignmentStatus = 'submitted';

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [],
    });

    const serialised = JSON.stringify(outcome);
    expect(serialised).not.toMatch(/duplicate key/i);
    expect(serialised).not.toMatch(/violates unique constraint/i);
    expect(serialised).not.toMatch(/submissions_assignment_id_key/);
  });
});

describe('retry after a partial failure', () => {
  /**
   * The exact staging state: the submission row exists, the photo step blew up,
   * and the assignment was never advanced past `assigned`.
   */
  function partiallyFailed() {
    const harness = createHarness();
    harness.state.submissions.push({
      id: 'sub-partial',
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      autoScore: null,
    });
    return harness;
  }

  it('reuses the existing submission instead of inserting a second row', async () => {
    const { ports, state } = partiallyFailed();

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(outcome.status).toBe('submitted');
    expect(state.submissions).toHaveLength(1);
    expect(state.submissions[0]!.id).toBe('sub-partial');
  });

  it('refreshes the answers, so a corrected retry is not silently discarded', async () => {
    const { ports, state } = createHarness({ snapshot: comprehensionFixture });
    state.submissions.push({
      id: 'sub-partial',
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      autoScore: null,
    });

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: comprehensionAnswers(),
      photos: [],
    });

    expect(state.submissions[0]!.answers).not.toEqual(NO_ANSWERS);
  });

  it('completes the parts that had not run yet', async () => {
    const { ports, state } = partiallyFailed();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(state.assignmentStatus).toBe('submitted');
    expect(state.assets).toHaveLength(1);
  });

  it('writes assets under the REUSED submission id, not a fresh one', async () => {
    const { ports, state } = partiallyFailed();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect([...state.objects.keys()]).toEqual([pathFor(0, 'sub-partial')]);
  });
});

describe('photo retry does not accumulate rows or objects', () => {
  it('does not create duplicate submission_assets for the same photo', async () => {
    const { ports, state } = createHarness();
    const input: SubmitInput = {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    };

    await runSubmission(ports, input);
    // Reset the status so the second call is a genuine retry rather than the
    // already-submitted short circuit.
    state.assignmentStatus = 'assigned';
    await runSubmission(ports, input);

    expect(state.assets).toHaveLength(1);
    expect(state.objects.size).toBe(1);
  });

  it('keeps one row per photo when the retry carries fewer photos', async () => {
    const { ports, state } = createHarness();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1), photo(2), photo(3)],
    });
    expect(state.assets).toHaveLength(3);

    state.assignmentStatus = 'assigned';
    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(4)],
    });

    expect(state.assets).toHaveLength(1);
  });

  it('removes the storage objects the shorter retry orphaned', async () => {
    const { ports, state } = createHarness();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1), photo(2), photo(3)],
    });

    state.assignmentStatus = 'assigned';
    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(4)],
    });

    // Indices 1 and 2 no longer have a row, so they must not linger in a
    // private bucket that nothing points at.
    expect([...state.objects.keys()]).toEqual([pathFor(0)]);
  });

  it('leaves existing photos alone when the retry carries none', async () => {
    const { ports, state } = createHarness();

    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    state.assignmentStatus = 'assigned';
    await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [],
    });

    // An empty file input means "no change" — the input is empty on every fresh
    // page load, so treating it as "delete my work" would lose the photo.
    expect(state.assets).toHaveLength(1);
    expect(state.objects.size).toBe(1);
  });
});

describe('failures stay safe and reportable', () => {
  it('swallows a throw from the asset write instead of forwarding it', async () => {
    // The adapter throws `submission_assets.insert: <supabase message>`; that
    // string must not become the child's error text.
    const { ports, state } = createHarness({
      overrides: {
        async replaceAssets() {
          throw new Error(
            'submission_assets.insert: new row violates row-level security policy for table "submission_assets"',
          );
        },
      },
    });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(outcome).toEqual({ status: 'error', reason: 'unexpected' });
    expect(JSON.stringify(outcome)).not.toMatch(/row-level security|submission_assets/);
    expect(state.assignmentStatus).toBe('assigned');
  });

  it('reports a rejected photo without marking the assignment submitted', async () => {
    const { ports, state } = createHarness({
      overrides: {
        async sanitise() {
          return { ok: false, reason: 'too_large', detail: '20000000 bytes exceeds 15728640' };
        },
      },
    });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(outcome).toEqual({ status: 'error', reason: 'photo_rejected' });
    expect(state.assignmentStatus).toBe('assigned');
    expect(state.assets).toHaveLength(0);
  });

  it('does not leak the sanitiser detail to the child', async () => {
    const { ports } = createHarness({
      overrides: {
        async sanitise() {
          return { ok: false, reason: 'not_an_image', detail: 'VipsJpeg: Premature end of input' };
        },
      },
    });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(JSON.stringify(outcome)).not.toContain('VipsJpeg');
  });

  it('reports an upload failure without leaking the storage error', async () => {
    const { ports, state } = createHarness({
      overrides: {
        async upload() {
          return { ok: false, message: 'Bucket not found: submissions' };
        },
      },
    });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [photo(1)],
    });

    expect(outcome).toEqual({ status: 'error', reason: 'storage_failed' });
    expect(JSON.stringify(outcome)).not.toContain('Bucket not found');
    expect(state.assignmentStatus).toBe('assigned');
  });

  it('reports a missing assignment as not-found, not as a crash', async () => {
    const { ports } = createHarness();

    const outcome = await runSubmission(ports, {
      assignmentId: '44444444-4444-4444-8444-444444444444',
      answers: NO_ANSWERS,
      photos: [],
    });

    expect(outcome).toEqual({ status: 'error', reason: 'not_found' });
  });

  it('translates a database duplicate-key throw into a safe outcome', async () => {
    // Belt and braces for the concurrent-submit race: two requests can both
    // pass the status check, and the loser must not show Postgres to a child.
    const { ports } = createHarness({
      overrides: {
        async upsertSubmission() {
          throw new Error(
            'submissions.create: duplicate key value violates unique constraint "submissions_assignment_id_key"',
          );
        },
      },
    });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [],
    });

    expect(outcome.status).toBe('already_submitted');
    expect(JSON.stringify(outcome)).not.toMatch(/duplicate key|unique constraint/i);
  });

  it('turns any other database throw into a generic outcome', async () => {
    const { ports } = createHarness({
      overrides: {
        async upsertSubmission() {
          throw new Error(
            'submissions.create: connection to server at "db.abc.supabase.co" failed',
          );
        },
      },
    });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [],
    });

    expect(outcome).toEqual({ status: 'error', reason: 'unexpected' });
    expect(JSON.stringify(outcome)).not.toContain('supabase.co');
  });

  it('does not upload anything when the answers fail validation', async () => {
    const { ports, state } = createHarness({ snapshot: comprehensionFixture });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: { text: {}, choice: { 'no-such-question': 'a' } },
      photos: [photo(1)],
    });

    expect(outcome.status).toBe('error');
    expect(state.objects.size).toBe(0);
    expect(state.submissions).toHaveLength(0);
  });

  it('rejects a snapshot that no longer parses, without creating a submission', async () => {
    const { ports, state } = createHarness({ snapshot: { not: 'an activity' } });

    const outcome = await runSubmission(ports, {
      assignmentId: ASSIGNMENT,
      answers: NO_ANSWERS,
      photos: [],
    });

    expect(outcome).toEqual({ status: 'error', reason: 'invalid_snapshot' });
    expect(state.submissions).toHaveLength(0);
  });
});
