/**
 * assertAssignable — defence-in-depth layer 2 (PRODUCT_SPEC.md §11.3).
 *
 * TypeScript is a SAFETY LAYER, NOT A SECURITY BOUNDARY. Types are erased at
 * runtime: a value arriving from JSON.parse, a raw SQL row, an `as` cast, or a
 * future code path is not checked by the compiler. Neither is a zod schema
 * that nobody calls.
 *
 * So the single assignment path calls this at runtime, on whatever object
 * actually reached it. It is unit-tested with values deliberately cast past
 * the compiler, to prove the CHECK does the work rather than the types.
 *
 * Layer 1 is zod validation; layer 3 is the database constraint on
 * `activity_templates`. Each catches what the one above it misses.
 */
import type { Activity } from './schema';

export class NotAssignableError extends Error {
  constructor(
    readonly rule: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotAssignableError';
  }
}

export interface AssignabilityContext {
  /** The parent performing the assignment, from the verified session. */
  actingParentId: string;
}

/**
 * Throws unless this activity may be assigned to a child right now.
 *
 * Deliberately takes `unknown`: the whole point is that it does not trust the
 * caller's type claim.
 */
export function assertAssignable(candidate: unknown, ctx: AssignabilityContext): Activity {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new NotAssignableError('not_an_object', 'Activity must be an object.');
  }

  // Read through a permissive shape on purpose: this function must not trust
  // the caller's type claim, so it treats the value as untyped data.
  const a = candidate as {
    status?: unknown;
    safety?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  };

  if (a.status !== 'approved') {
    throw new NotAssignableError(
      'status_not_approved',
      `Only approved content may be assigned (got ${String(a.status)}).`,
    );
  }

  if (!a.safety || typeof a.safety.reviewedBy !== 'string' || a.safety.reviewedBy.length === 0) {
    throw new NotAssignableError(
      'not_human_reviewed',
      'Every activity must record a human reviewer.',
    );
  }

  const provenance = a.provenance;
  if (!provenance || typeof provenance.source !== 'string') {
    throw new NotAssignableError('missing_provenance', 'Activity must record its provenance.');
  }

  if (provenance.source === 'ai') {
    const approvedBy = provenance.approvedByParentId;
    if (typeof approvedBy !== 'string' || approvedBy.length === 0) {
      throw new NotAssignableError(
        'ai_not_approved',
        'AI-generated content requires an explicit parent approval before it can be assigned.',
      );
    }
    if (approvedBy !== ctx.actingParentId) {
      // A parent may only assign AI content THEY approved. One parent's
      // approval does not authorise another family's assignment.
      throw new NotAssignableError(
        'ai_approved_by_other_parent',
        'AI content may only be assigned by the parent who approved it.',
      );
    }
    if (typeof provenance.approvedAt !== 'string' || provenance.approvedAt.length === 0) {
      throw new NotAssignableError('ai_missing_approval_time', 'Approval timestamp is required.');
    }
  } else if (provenance.source !== 'seed') {
    throw new NotAssignableError(
      'unknown_provenance',
      `Unknown content source: ${String(provenance.source)}`,
    );
  }

  return candidate as Activity;
}

/** Non-throwing variant for UI affordances. Never use this as the gate. */
export function isAssignable(candidate: unknown, ctx: AssignabilityContext): boolean {
  try {
    assertAssignable(candidate, ctx);
    return true;
  } catch {
    return false;
  }
}
