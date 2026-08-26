import type { SupabaseClient } from '@supabase/supabase-js';
import type { Child, ChildTypeProgress, Interest, NewChild, Parent } from '@/lib/domain/entities';
import type {
  ChildRepository,
  InterestRepository,
  ParentRepository,
  ProgressRepository,
  TemplateRepository,
  AssignmentRepository,
  SubmissionRepository,
} from '@/lib/data/repositories';
import { toAssignment, toChild, toInterest, toParent, toProgress, toTemplate } from './mappers';

/**
 * Supabase-backed repositories.
 *
 * Every query below is additionally constrained by RLS. The explicit
 * `parent_id` / ownership filters are defence in depth and a query-planner
 * hint — never the boundary. A repository that forgot one would still be
 * unable to reach another family's rows.
 */

type DB = SupabaseClient;

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? 'unknown error'}`);
}

export function createParentRepository(db: DB): ParentRepository {
  return {
    async findById(id) {
      const { data, error } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
      if (error) fail('profiles.findById', error);
      return data ? toParent(data) : null;
    },

    async updateDisplayName(id, displayName) {
      const { data, error } = await db
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', id)
        .select('*')
        .single();
      if (error) fail('profiles.updateDisplayName', error);
      return toParent(data) as Parent;
    },

    async setChildModePinHash(id, pinHash) {
      const { error } = await db
        .from('profiles')
        .update({ child_mode_pin_hash: pinHash })
        .eq('id', id);
      if (error) fail('profiles.setChildModePinHash', error);
    },
  };
}

export function createChildRepository(db: DB, parentId: string): ChildRepository {
  return {
    async listByParent(_parentId, options) {
      let query = db.from('children').select('*').eq('parent_id', parentId);
      if (!options?.includeArchived) query = query.is('archived_at', null);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) fail('children.listByParent', error);
      return (data ?? []).map(toChild);
    },

    async findById(childId) {
      const { data, error } = await db
        .from('children')
        .select('*')
        .eq('id', childId)
        .eq('parent_id', parentId)
        .maybeSingle();
      if (error) fail('children.findById', error);
      return data ? toChild(data) : null;
    },

    async create(child: NewChild) {
      const { data, error } = await db
        .from('children')
        .insert({
          parent_id: parentId,
          display_name: child.displayName,
          birth_year: child.birthYear,
          birth_month: child.birthMonth,
          grade: child.grade,
          avatar_key: child.avatarKey ?? 'cat',
          locale: child.locale ?? 'vi',
        })
        .select('*')
        .single();
      if (error) fail('children.create', error);
      return toChild(data) as Child;
    },

    async update(childId, patch) {
      const row: Record<string, unknown> = {};
      if (patch.displayName !== undefined) row.display_name = patch.displayName;
      if (patch.birthYear !== undefined) row.birth_year = patch.birthYear;
      if (patch.birthMonth !== undefined) row.birth_month = patch.birthMonth;
      if (patch.grade !== undefined) row.grade = patch.grade;
      if (patch.avatarKey !== undefined) row.avatar_key = patch.avatarKey;
      if (patch.locale !== undefined) row.locale = patch.locale;

      const { data, error } = await db
        .from('children')
        .update(row)
        .eq('id', childId)
        .eq('parent_id', parentId)
        .select('*')
        .single();
      if (error) fail('children.update', error);
      return toChild(data) as Child;
    },

    async archive(childId) {
      const { error } = await db
        .from('children')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', childId)
        .eq('parent_id', parentId);
      if (error) fail('children.archive', error);
    },
  };
}

export function createInterestRepository(db: DB): InterestRepository {
  return {
    async listAll(): Promise<Interest[]> {
      const { data, error } = await db.from('interests').select('*').order('sort_order');
      if (error) fail('interests.listAll', error);
      return (data ?? []).map(toInterest);
    },

    async listForChild(childId) {
      const { data, error } = await db
        .from('child_interests')
        .select('interests(*)')
        .eq('child_id', childId);
      if (error) fail('interests.listForChild', error);
      return (data ?? [])
        .map((row) => (row as { interests: unknown }).interests)
        .filter(Boolean)
        .map((r) => toInterest(r as Parameters<typeof toInterest>[0]));
    },

    async setForChild(childId, interestIds) {
      const { error: deleteError } = await db
        .from('child_interests')
        .delete()
        .eq('child_id', childId);
      if (deleteError) fail('interests.setForChild(delete)', deleteError);

      if (interestIds.length === 0) return;

      const { error } = await db
        .from('child_interests')
        .insert(interestIds.map((interestId) => ({ child_id: childId, interest_id: interestId })));
      if (error) fail('interests.setForChild(insert)', error);
    },
  };
}

export function createProgressRepository(db: DB): ProgressRepository {
  return {
    async listForChild(childId): Promise<ChildTypeProgress[]> {
      const { data, error } = await db
        .from('child_type_progress')
        .select('*')
        .eq('child_id', childId);
      if (error) fail('progress.listForChild', error);
      return (data ?? []).map(toProgress);
    },

    async upsert(progress) {
      const { data, error } = await db
        .from('child_type_progress')
        .upsert({
          child_id: progress.childId,
          type: progress.type,
          difficulty: progress.difficulty,
          streak_success: progress.streakSuccess,
          streak_struggle: progress.streakStruggle,
          last_assigned_at: progress.lastAssignedAt,
        })
        .select('*')
        .single();
      if (error) fail('progress.upsert', error);
      return toProgress(data);
    },
  };
}

export function createTemplateRepository(db: DB): TemplateRepository {
  return {
    async findById(templateId) {
      const { data, error } = await db
        .from('activity_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();
      if (error) fail('templates.findById', error);
      return data ? toTemplate(data) : null;
    },

    async listApproved(query) {
      // RLS already restricts this to approved global rows plus the caller's
      // own drafts; the filters below are for the parent's browsing, not
      // for security.
      let q = db
        .from('activity_templates')
        .select('*')
        .eq('status', 'approved')
        .is('owner_id', null);

      if (query?.type) q = q.eq('type', query.type);
      if (query?.locale) q = q.eq('locale', query.locale);
      if (query?.minDifficulty !== undefined) q = q.gte('difficulty', query.minDifficulty);
      if (query?.maxDifficulty !== undefined) q = q.lte('difficulty', query.maxDifficulty);
      if (query?.interestSlugs && query.interestSlugs.length > 0) {
        q = q.overlaps('interest_tags', query.interestSlugs);
      }

      const { data, error } = await q.order('type').order('difficulty');
      if (error) fail('templates.listApproved', error);
      return (data ?? []).map(toTemplate);
    },
  };
}

export function createAssignmentRepository(db: DB): AssignmentRepository {
  return {
    async findById(assignmentId) {
      const { data, error } = await db
        .from('assignments')
        .select('*')
        .eq('id', assignmentId)
        .maybeSingle();
      if (error) fail('assignments.findById', error);
      return data ? toAssignment(data) : null;
    },

    async listForChild(childId, options) {
      let q = db.from('assignments').select('*').eq('child_id', childId);
      if (options?.statuses && options.statuses.length > 0) {
        q = q.in('status', options.statuses);
      }
      const { data, error } = await q.order('assigned_at', { ascending: false });
      if (error) fail('assignments.listForChild', error);
      return (data ?? []).map(toAssignment);
    },

    async listRecentForChild(childId, withinDays) {
      const since = new Date(Date.now() - withinDays * 86_400_000).toISOString();
      const { data, error } = await db
        .from('assignments')
        .select('*')
        .eq('child_id', childId)
        .gte('assigned_at', since)
        .order('assigned_at', { ascending: false });
      if (error) fail('assignments.listRecentForChild', error);
      return (data ?? []).map(toAssignment);
    },

    async create(assignment) {
      const { data, error } = await db
        .from('assignments')
        .insert({
          child_id: assignment.childId,
          template_id: assignment.templateId,
          assigned_by: assignment.assignedBy,
          difficulty_at_assignment: assignment.difficultyAtAssignment,
          content_snapshot: assignment.contentSnapshot,
          snapshot_schema_version: assignment.snapshotSchemaVersion,
          due_on: assignment.dueOn ?? null,
        })
        .select('*')
        .single();
      if (error) fail('assignments.create', error);
      return toAssignment(data);
    },

    async updateStatus(assignmentId, status) {
      const patch: Record<string, unknown> = { status };
      if (status === 'in_progress') patch.started_at = new Date().toISOString();
      if (status === 'submitted') patch.submitted_at = new Date().toISOString();
      if (status === 'reviewed') patch.reviewed_at = new Date().toISOString();

      const { data, error } = await db
        .from('assignments')
        .update(patch)
        .eq('id', assignmentId)
        .select('*')
        .single();
      if (error) fail('assignments.updateStatus', error);
      return toAssignment(data);
    },
  };
}

export function createSubmissionRepository(db: DB): SubmissionRepository {
  return {
    async findByAssignment(assignmentId) {
      const { data, error } = await db
        .from('submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .maybeSingle();
      if (error) fail('submissions.findByAssignment', error);
      return data
        ? {
            id: data.id,
            assignmentId: data.assignment_id,
            answers: data.answers,
            autoScore: data.auto_score,
            submittedAt: data.submitted_at,
          }
        : null;
    },

    async create({ assignmentId, answers, autoScore }) {
      const { data, error } = await db
        .from('submissions')
        .insert({ assignment_id: assignmentId, answers, auto_score: autoScore })
        .select('*')
        .single();
      if (error) fail('submissions.create', error);
      return {
        id: data.id,
        assignmentId: data.assignment_id,
        answers: data.answers,
        autoScore: data.auto_score,
        submittedAt: data.submitted_at,
      };
    },

    async delete(submissionId) {
      // Assets cascade at the database level.
      const { error } = await db.from('submissions').delete().eq('id', submissionId);
      if (error) fail('submissions.delete', error);
    },
  };
}
