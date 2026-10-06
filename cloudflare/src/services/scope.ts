// Who sees and changes which rows. ADMIN and ACCOUNTS: everything. INCHARGE: their own department. STAFF: their own
// rows (daily updates: their department, so the team's filling status shows). A login with a role but no linked staff
// row (INCHARGE / STAFF set by hand) sees nothing, never everything.
import type { Ctx } from '../api/context';
import type { Db } from '../db';
import { ApiError, forbidden } from '../domain/errors';

const NOBODY = '00000000-0000-0000-0000-000000000000';

export const seesAll = (c: Ctx) => c.user.role === 'ADMIN' || c.user.role === 'ACCOUNTS';

/** Row filter for a table with staff_id and dept columns (alias given). */
export function rowScope(c: Ctx, alias: string) {
  const { sql } = c;
  if (seesAll(c)) return sql``;
  if (c.user.role === 'INCHARGE') return sql`and ${sql(alias)}.dept = ${c.user.dept ?? '-'}`;
  return sql`and ${sql(alias)}.staff_id = ${c.user.staffId ?? NOBODY}::uuid`;
}

/** Department-wide filter (INCHARGE and STAFF see their department). */
export function deptScope(c: Ctx, alias: string) {
  const { sql } = c;
  if (seesAll(c)) return sql``;
  return sql`and ${sql(alias)}.dept = ${c.user.dept ?? '-'}`;
}

export interface StaffRef {
  id: string;
  name: string;
  dept: string;
}

/** An active staff member, or 400 (a form names someone who was removed meanwhile). */
export async function loadStaff(db: Db, id: string | null): Promise<StaffRef> {
  if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) throw new ApiError(400, 'Validation failed', { staffId: 'must not be blank' });
  const [s] = await db`select id::text, name, dept from public.staff where id = ${id}::uuid and active`;
  if (!s) throw new ApiError(400, 'Validation failed', { staffId: 'is not an active staff member' });
  return s as unknown as StaffRef;
}

/** May this login make or change entries for this staff member? */
export function assertMayActFor(c: Ctx, s: StaffRef): void {
  if (seesAll(c)) return;
  if (c.user.role === 'INCHARGE' && s.dept === c.user.dept) return;
  if (c.user.role === 'STAFF' && s.id === c.user.staffId) return;
  throw forbidden(c.user.role === 'INCHARGE'
    ? 'An incharge can only make entries for staff of their own department.'
    : 'You can only make entries for yourself.');
}

/** The staff member a STAFF / INCHARGE login acts as when the form sends none (or for STAFF, always). */
export function ownStaffId(c: Ctx, sent: string | null): string | null {
  if (c.user.role === 'STAFF') return c.user.staffId;
  return sent || c.user.staffId;
}
