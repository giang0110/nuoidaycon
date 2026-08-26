/**
 * Domain entities — the shapes the rest of the application reasons about.
 *
 * Pure TypeScript. No Supabase, no Next.js, no React (decision A1, lint-enforced).
 * These mirror the schema in supabase/migrations, but they are the *domain's*
 * view: `age` is absent here exactly as it is absent from the database, because
 * it is derived at request time and never persisted (principle P5).
 */

export type ActivityType =
  | 'handwriting'
  | 'drawing_prompt'
  | 'story_comprehension'
  | 'story_summary'
  | 'reflection'
  | 'situation_judgment';

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
];

export const GRADE_LEVELS = [
  'preschool',
  'grade_1',
  'grade_2',
  'grade_3',
  'grade_4',
  'grade_5',
  'grade_6',
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];

export type AssignmentStatus = 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'skipped';
export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'archived';
export type ContentSource = 'seed' | 'ai';
export type ReviewVerdict = 'too_easy' | 'just_right' | 'too_hard';
export type ResponseMode = 'none' | 'text' | 'choice' | 'photo' | 'mixed';
export type Locale = 'vi' | 'en';

/** 1–5. Not branded yet; the engine clamps it to the age band in Phase 4. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Parent {
  id: string;
  displayName: string;
  locale: Locale;
  hasChildModePin: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A child profile. Not an account (decision A7).
 *
 * Note what is NOT here: no email, no exact date of birth, no age, no photo.
 * Age is computed from birthYear + birthMonth when it is needed and thrown
 * away again (CHILD_SAFETY.md §3).
 */
export interface Child {
  id: string;
  parentId: string;
  displayName: string;
  birthYear: number;
  /** 1–12. */
  birthMonth: number;
  grade: GradeLevel;
  avatarKey: string;
  locale: Locale;
  archivedAt: string | null;
  createdAt: string;
}

export interface NewChild {
  parentId: string;
  displayName: string;
  birthYear: number;
  birthMonth: number;
  grade: GradeLevel;
  avatarKey?: string;
  locale?: Locale;
}

export interface Interest {
  id: string;
  slug: string;
  labelVi: string;
  labelEn: string;
  sortOrder: number;
}

/**
 * A catalog entry. `payload` is validated against the canonical Activity schema
 * in Phase 4; here it is deliberately `unknown` so nothing depends on its shape
 * before that schema exists.
 */
export interface ActivityTemplate {
  id: string;
  slug: string;
  type: ActivityType;
  locale: Locale;
  title: string;
  instructions: string;
  minAge: number;
  maxAge: number;
  gradeMin: GradeLevel;
  gradeMax: GradeLevel;
  difficulty: Difficulty;
  estimatedMinutes: number;
  interestTags: string[];
  responseMode: ResponseMode;
  payload: unknown;
  status: ContentStatus;
  source: ContentSource;
  /** Required by the database when source is 'ai' and status is 'approved'. */
  approvedByParentId: string | null;
  /** null for global seed content; set for a parent's private draft. */
  ownerId: string | null;
  schemaVersion: number;
  policyVersion: string;
  version: number;
  createdAt: string;
}

export interface ChildTypeProgress {
  childId: string;
  type: ActivityType;
  difficulty: Difficulty;
  streakSuccess: number;
  streakStruggle: number;
  lastAssignedAt: string | null;
}

/**
 * One activity given to one child.
 *
 * `contentSnapshot` is immutable (decision A5) — the database rejects any
 * attempt to change it after insert. The child always sees what the parent
 * previewed, and a later template edit cannot rewrite history.
 */
export interface Assignment {
  id: string;
  childId: string;
  templateId: string;
  assignedBy: string;
  status: AssignmentStatus;
  difficultyAtAssignment: Difficulty;
  contentSnapshot: unknown;
  snapshotSchemaVersion: number;
  dueOn: string | null;
  assignedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface Submission {
  id: string;
  assignmentId: string;
  answers: unknown;
  autoScore: unknown | null;
  submittedAt: string;
}

export interface SubmissionAsset {
  id: string;
  submissionId: string;
  /** `{parentId}/{childId}/{submissionId}/{filename}` in the private bucket. */
  storagePath: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  createdAt: string;
}

export interface AssignmentReview {
  id: string;
  assignmentId: string;
  reviewerId: string;
  verdict: ReviewVerdict;
  note: string | null;
  createdAt: string;
}

export type ContentReportReason =
  'unsafe' | 'age_inappropriate' | 'factually_wrong' | 'confusing' | 'other';

export interface ContentReport {
  id: string;
  reporterId: string;
  templateId: string;
  assignmentId: string | null;
  reason: ContentReportReason;
  details: string | null;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
