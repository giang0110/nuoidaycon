/**
 * Row → domain mapping. Kept separate from the repositories so it is unit
 * testable without a database or a Supabase client.
 */
import type {
  ActivityTemplate,
  Assignment,
  Child,
  ChildTypeProgress,
  Difficulty,
  Interest,
  Parent,
} from '@/lib/domain/entities';

export interface ProfileRow {
  id: string;
  display_name: string;
  locale: string;
  child_mode_pin_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildRow {
  id: string;
  parent_id: string;
  display_name: string;
  birth_year: number;
  birth_month: number;
  grade: string;
  avatar_key: string;
  locale: string;
  archived_at: string | null;
  created_at: string;
}

export interface InterestRow {
  id: string;
  slug: string;
  label_vi: string;
  label_en: string;
  sort_order: number;
}

export function toParent(row: ProfileRow): Parent {
  return {
    id: row.id,
    displayName: row.display_name,
    locale: row.locale === 'en' ? 'en' : 'vi',
    // Never expose the hash itself — only whether one is set.
    hasChildModePin: row.child_mode_pin_hash !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toChild(row: ChildRow): Child {
  return {
    id: row.id,
    parentId: row.parent_id,
    displayName: row.display_name,
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    grade: row.grade as Child['grade'],
    avatarKey: row.avatar_key,
    locale: row.locale === 'en' ? 'en' : 'vi',
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    // Note: no `age` field. Age is derived at render time and never stored,
    // cached, or carried on the entity (principle P5).
  };
}

export function toInterest(row: InterestRow): Interest {
  return {
    id: row.id,
    slug: row.slug,
    labelVi: row.label_vi,
    labelEn: row.label_en,
    sortOrder: row.sort_order,
  };
}

export function toProgress(row: {
  child_id: string;
  type: string;
  difficulty: number;
  streak_success: number;
  streak_struggle: number;
  last_assigned_at: string | null;
}): ChildTypeProgress {
  return {
    childId: row.child_id,
    type: row.type as ChildTypeProgress['type'],
    difficulty: row.difficulty as Difficulty,
    streakSuccess: row.streak_success,
    streakStruggle: row.streak_struggle,
    lastAssignedAt: row.last_assigned_at,
  };
}

export function toTemplate(row: Record<string, unknown>): ActivityTemplate {
  return {
    id: row.id as string,
    slug: row.slug as string,
    type: row.type as ActivityTemplate['type'],
    locale: (row.locale === 'en' ? 'en' : 'vi') as ActivityTemplate['locale'],
    title: row.title as string,
    instructions: row.instructions as string,
    minAge: row.min_age as number,
    maxAge: row.max_age as number,
    gradeMin: row.grade_min as ActivityTemplate['gradeMin'],
    gradeMax: row.grade_max as ActivityTemplate['gradeMax'],
    difficulty: row.difficulty as Difficulty,
    estimatedMinutes: row.estimated_minutes as number,
    interestTags: (row.interest_tags as string[] | null) ?? [],
    responseMode: row.response_mode as ActivityTemplate['responseMode'],
    payload: row.payload,
    status: row.status as ActivityTemplate['status'],
    source: row.source as ActivityTemplate['source'],
    approvedByParentId: (row.approved_by_parent_id as string | null) ?? null,
    ownerId: (row.owner_id as string | null) ?? null,
    schemaVersion: row.schema_version as number,
    policyVersion: row.policy_version as string,
    version: row.version as number,
    createdAt: row.created_at as string,
  };
}

export function toAssignment(row: Record<string, unknown>): Assignment {
  return {
    id: row.id as string,
    childId: row.child_id as string,
    templateId: row.template_id as string,
    assignedBy: row.assigned_by as string,
    status: row.status as Assignment['status'],
    difficultyAtAssignment: row.difficulty_at_assignment as Difficulty,
    contentSnapshot: row.content_snapshot,
    snapshotSchemaVersion: row.snapshot_schema_version as number,
    dueOn: (row.due_on as string | null) ?? null,
    assignedAt: row.assigned_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
  };
}

/**
 * The stored `payload` column holds the COMPLETE validated Activity document,
 * not just its type-specific part. The other columns are a denormalised
 * projection for indexing and database constraints.
 *
 * Reading the document back verbatim means nothing is reconstructed — and a
 * reconstruction is exactly where an ageBand or a response spec would get
 * quietly invented.
 */
export function toActivityDocument(row: Record<string, unknown>): unknown {
  return row.payload;
}
