/**
 * Repository interfaces — the seam between the pure domain and the database.
 *
 * Decision A1: `lib/domain` never imports Supabase. It takes one of these
 * interfaces instead, so the engine and the policy code are testable with
 * in-memory fakes, no database and no network.
 *
 * These are TYPES ONLY. The Supabase implementations live in
 * `lib/data/supabase/` and arrive with the features that need them (Phase 3
 * onwards) — writing them now would be speculative.
 *
 * Every method below is additionally protected by RLS. Application-side
 * ownership checks are defence in depth, never the boundary: a repository that
 * forgets a `where parent_id = …` still cannot read another family's rows.
 */
import type {
  ActivityTemplate,
  ActivityType,
  Assignment,
  AssignmentReview,
  AuditEvent,
  Child,
  ChildTypeProgress,
  ContentReport,
  Interest,
  NewChild,
  Parent,
  Submission,
  SubmissionAsset,
} from '@/lib/domain/entities';

export interface ParentRepository {
  findById(id: string): Promise<Parent | null>;
  updateDisplayName(id: string, displayName: string): Promise<Parent>;
  setChildModePinHash(id: string, pinHash: string): Promise<void>;
}

export interface ChildRepository {
  listByParent(parentId: string, options?: { includeArchived?: boolean }): Promise<Child[]>;
  findById(childId: string): Promise<Child | null>;
  create(child: NewChild): Promise<Child>;
  update(childId: string, patch: Partial<Omit<NewChild, 'parentId'>>): Promise<Child>;
  /** Soft delete, so completed work and its history survive. */
  archive(childId: string): Promise<void>;
}

export interface InterestRepository {
  listAll(): Promise<Interest[]>;
  listForChild(childId: string): Promise<Interest[]>;
  setForChild(childId: string, interestIds: string[]): Promise<void>;
}

export interface TemplateQuery {
  type?: ActivityType;
  locale?: string;
  minDifficulty?: number;
  maxDifficulty?: number;
  interestSlugs?: string[];
}

/**
 * Read-only by design. The database grants clients no INSERT, UPDATE or DELETE
 * on `activity_templates`; the catalog is written by the seed loader running as
 * owner (PRODUCT_SPEC.md §11.2). There is deliberately no `create` here.
 */
export interface TemplateRepository {
  findById(templateId: string): Promise<ActivityTemplate | null>;
  listApproved(query?: TemplateQuery): Promise<ActivityTemplate[]>;
}

export interface ProgressRepository {
  listForChild(childId: string): Promise<ChildTypeProgress[]>;
  upsert(progress: ChildTypeProgress): Promise<ChildTypeProgress>;
}

export interface NewAssignment {
  childId: string;
  templateId: string;
  assignedBy: string;
  difficultyAtAssignment: number;
  /** Deep copy of the validated activity. Immutable once written (A5). */
  contentSnapshot: unknown;
  snapshotSchemaVersion: number;
  dueOn?: string | null;
}

export interface AssignmentRepository {
  findById(assignmentId: string): Promise<Assignment | null>;
  listForChild(childId: string, options?: { statuses?: string[] }): Promise<Assignment[]>;
  /**
   * Recent assignments, for the engine's cooldown and novelty scoring.
   *
   * Takes a window in DAYS rather than a timestamp: reading the clock is the
   * data layer's job, not the caller's. A server component that computes
   * `Date.now()` inline is both impure during render and an invitation to pass
   * an inconsistent `now` to the engine.
   */
  listRecentForChild(childId: string, withinDays: number): Promise<Assignment[]>;
  create(assignment: NewAssignment): Promise<Assignment>;
  updateStatus(assignmentId: string, status: Assignment['status']): Promise<Assignment>;
}

export interface SubmissionRepository {
  findByAssignment(assignmentId: string): Promise<Submission | null>;
  create(input: {
    assignmentId: string;
    answers: unknown;
    autoScore: unknown | null;
  }): Promise<Submission>;
  /**
   * Get-or-create for one assignment, in a single statement.
   *
   * `assignment_id` is UNIQUE, so a plain insert turns any retry — a refresh, a
   * back button, a second attempt after a photo failed — into a 23505 the child
   * should never see. Read-then-insert would only narrow the window; ON
   * CONFLICT closes it.
   *
   * Answers are refreshed on conflict so a corrected retry is not discarded.
   * `submitted_at` keeps its original value: it records when the child first
   * finished, not when the upload finally went through.
   */
  upsertByAssignment(input: {
    assignmentId: string;
    answers: unknown;
    autoScore: unknown | null;
  }): Promise<Submission>;
  /** A parent may delete their child's work; assets cascade (approved decision). */
  delete(submissionId: string): Promise<void>;
}

export interface SubmissionAssetRepository {
  listBySubmission(submissionId: string): Promise<SubmissionAsset[]>;
  create(input: Omit<SubmissionAsset, 'id' | 'createdAt'>): Promise<SubmissionAsset>;
  delete(assetId: string): Promise<void>;
}

export interface ReviewRepository {
  findByAssignment(assignmentId: string): Promise<AssignmentReview | null>;
  listForAssignments(assignmentIds: readonly string[]): Promise<AssignmentReview[]>;
  create(input: Omit<AssignmentReview, 'id' | 'createdAt'>): Promise<AssignmentReview>;
}

export interface ContentReportRepository {
  create(input: Omit<ContentReport, 'id' | 'status' | 'createdAt'>): Promise<ContentReport>;
  listByReporter(reporterId: string): Promise<ContentReport[]>;
}

/** Append-only. No update, no delete — the database grants neither. */
export interface AuditRepository {
  append(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void>;
}

/**
 * Private-bucket access. Objects are never public; the application hands out
 * short-lived signed URLs and nothing else (decision A10).
 *
 * ⚠️ Phase 5: `upload` MUST decode and re-encode the image server-side so EXIF
 * is discarded before the object is stored. Client-side stripping is not
 * trusted. See CHILD_SAFETY.md §7.
 */
export interface SubmissionStorage {
  /** `{parentId}/{childId}/{submissionId}/{filename}`. */
  buildPath(input: {
    parentId: string;
    childId: string;
    submissionId: string;
    filename: string;
  }): string;
  createSignedUrl(storagePath: string, expiresInSeconds: number): Promise<string>;
  remove(storagePath: string): Promise<void>;
}

/** Everything a request handler needs, resolved once per request. */
export interface Repositories {
  parents: ParentRepository;
  children: ChildRepository;
  interests: InterestRepository;
  templates: TemplateRepository;
  progress: ProgressRepository;
  assignments: AssignmentRepository;
  submissions: SubmissionRepository;
  submissionAssets: SubmissionAssetRepository;
  reviews: ReviewRepository;
  contentReports: ContentReportRepository;
  audit: AuditRepository;
  storage: SubmissionStorage;
}
