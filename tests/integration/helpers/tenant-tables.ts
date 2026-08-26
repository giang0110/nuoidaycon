/**
 * The authoritative list of tables the cross-tenant RLS matrix must cover.
 *
 * PRODUCT_SPEC.md §11.4 requires that adding a table without extending the
 * matrix fails CI. `rls-coverage.meta.test.ts` enumerates
 * `information_schema.tables` and checks it against this list, so the failure
 * mode is a loud test rather than a silently unprotected table.
 */

export type TableKind =
  | 'tenant' //   owned by a parent; full DML, narrowed by RLS
  | 'append' //   readable and appendable by its owner, never rewritten
  | 'catalog' //  global, read-only to clients
  | 'lookup'; //  global reference data, read-only to clients

export interface TableCoverage {
  readonly table: string;
  readonly kind: TableKind;
  /** Operations a client is granted at all. Others are `n/a` in the matrix. */
  readonly clientOps: readonly ('select' | 'insert' | 'update' | 'delete')[];
}

export const COVERED_TABLES: readonly TableCoverage[] = [
  { table: 'profiles', kind: 'tenant', clientOps: ['select', 'insert', 'update', 'delete'] },
  { table: 'children', kind: 'tenant', clientOps: ['select', 'insert', 'update', 'delete'] },
  { table: 'child_interests', kind: 'tenant', clientOps: ['select', 'insert', 'update', 'delete'] },
  {
    table: 'child_type_progress',
    kind: 'tenant',
    clientOps: ['select', 'insert', 'update', 'delete'],
  },
  { table: 'assignments', kind: 'tenant', clientOps: ['select', 'insert', 'update', 'delete'] },
  { table: 'submissions', kind: 'tenant', clientOps: ['select', 'insert', 'update', 'delete'] },
  {
    table: 'submission_assets',
    kind: 'tenant',
    clientOps: ['select', 'insert', 'update', 'delete'],
  },
  {
    table: 'assignment_reviews',
    kind: 'tenant',
    clientOps: ['select', 'insert', 'update', 'delete'],
  },
  { table: 'content_reports', kind: 'tenant', clientOps: ['select', 'insert', 'update', 'delete'] },
  { table: 'audit_events', kind: 'append', clientOps: ['select', 'insert'] },
  { table: 'activity_templates', kind: 'catalog', clientOps: ['select'] },
  { table: 'interests', kind: 'lookup', clientOps: ['select'] },
];

/** Tables where `FORCE ROW LEVEL SECURITY` is expected (PRODUCT_SPEC.md §11.2). */
export const FORCED_TABLES: readonly string[] = [
  'submissions',
  'submission_assets',
  'assignment_reviews',
  'content_reports',
];
