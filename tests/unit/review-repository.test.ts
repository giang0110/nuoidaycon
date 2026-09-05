import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRepository } from '@/lib/data/supabase/repositories';

interface CallState {
  fromCalls: number;
  table?: string;
  columns?: string;
  filterColumn?: string;
  filterValues?: readonly string[];
}

function listDb(rows: Record<string, unknown>[]) {
  const calls: CallState = { fromCalls: 0 };
  const db = {
    from(table: string) {
      calls.fromCalls += 1;
      calls.table = table;
      return {
        select(columns: string) {
          calls.columns = columns;
          return {
            async in(column: string, values: readonly string[]) {
              calls.filterColumn = column;
              calls.filterValues = values;
              return { data: rows, error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { db, calls };
}

describe('createReviewRepository.listForAssignments', () => {
  it('returns mapped reviews for the requested assignment ids', async () => {
    const { db, calls } = listDb([
      {
        id: 'review-1',
        assignment_id: 'assignment-1',
        reviewer_id: 'parent-1',
        verdict: 'just_right',
        note: 'Vừa sức',
        created_at: '2026-09-05T00:00:00.000Z',
      },
      {
        id: 'review-2',
        assignment_id: 'assignment-2',
        reviewer_id: 'parent-1',
        verdict: 'too_hard',
        note: null,
        created_at: '2026-09-05T01:00:00.000Z',
      },
    ]);

    const reviews = await createReviewRepository(db).listForAssignments([
      'assignment-1',
      'assignment-2',
    ]);

    expect(calls.table).toBe('assignment_reviews');
    expect(calls.columns).toBe('id, assignment_id, reviewer_id, verdict, note, created_at');
    expect(calls.filterColumn).toBe('assignment_id');
    expect(calls.filterValues).toEqual(['assignment-1', 'assignment-2']);
    expect(reviews).toEqual([
      {
        id: 'review-1',
        assignmentId: 'assignment-1',
        reviewerId: 'parent-1',
        verdict: 'just_right',
        note: 'Vừa sức',
        createdAt: '2026-09-05T00:00:00.000Z',
      },
      {
        id: 'review-2',
        assignmentId: 'assignment-2',
        reviewerId: 'parent-1',
        verdict: 'too_hard',
        note: null,
        createdAt: '2026-09-05T01:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list without querying Supabase when no ids are provided', async () => {
    const { db, calls } = listDb([]);

    const reviews = await createReviewRepository(db).listForAssignments([]);

    expect(reviews).toEqual([]);
    expect(calls.fromCalls).toBe(0);
  });
});
