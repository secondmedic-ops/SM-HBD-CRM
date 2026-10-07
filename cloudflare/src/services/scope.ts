// Who sees and changes which rows. ADMIN and ACCOUNTS: everything. INCHARGE: their own team (themselves and everyone
// who reports to them, directly or through an incharge below them: staff.incharge_id down the chain). STAFF: their own
// rows (daily updates: their team, so the team's filling status shows). A login with a role but no linked staff row (INCHARGE / STAFF set by hand) sees nothing, never
// everything.
import type { Ctx } from '../api/context';
import type { Db } from '../db';
import { ApiError, forbidden } from '../domain/errors';

const NOBODY = '00000000-0000-0000-0000-000000000000';

export const seesAll = (c: Ctx) => c.user.role === 'ADMIN' || c.user.role === 'ACCOUNTS';

/** Ids of an incharge's team: the incharge and everyone below them in the reporting chain (as a SQL sub-select). */
const teamOf = (c: Ctx, inchargeId: string | null) =>
  c.sql`(with recursive t(id) as (select ${inchargeId ?? NOBODY}::uuid
           union select s.id from public.staff s join t on s.incharge_id = t.id)
         select id from t)`;

/** Row filter for a table with a staff_id column (alias given). */
export function rowScope(c: Ctx, alias: string) {
  const { sql } = c;
  if (seesAll(c)) return sql``;
  if (c.user.role === 'INCHARGE') return sql`and ${sql(alias)}.staff_id in ${teamOf(c, c.user.staffId)}`;
  return sql`and ${sql(alias)}.staff_id = ${c.user.staffId ?? NOBODY}::uuid`;
}

/** Team-wide filter: an INCHARGE sees their team, a STAFF member their incharge's team (or only themselves). */
export function teamScope(c: Ctx, alias: string) {
  const { sql } = c;
  if (seesAll(c)) return sql``;
  if (c.user.role === 'INCHARGE') return sql`and ${sql(alias)}.staff_id in ${teamOf(c, c.user.staffId)}`;
  if (c.user.inchargeId) return sql`and ${sql(alias)}.staff_id in ${teamOf(c, c.user.inchargeId)}`;
  return sql`and ${sql(alias)}.staff_id = ${c.user.staffId ?? NOBODY}::uuid`;
}

export interface StaffRef {
  id: string;
  name: string;
  dept: string;
  /** The incharge this person reports to (null for incharges and unassigned staff). */
  incharge_id: string | null;
}

/** An active staff member, or 400 (a form names someone who was removed meanwhile). */
export async function loadStaff(db: Db, id: string | null): Promise<StaffRef> {
  if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) throw new ApiError(400, 'Validation failed', { staffId: 'must not be blank' });
  const [s] = await db`select id::text, name, dept, incharge_id::text from public.staff where id = ${id}::uuid and active`;
  if (!s) throw new ApiError(400, 'Validation failed', { staffId: 'is not an active staff member' });
  return s as unknown as StaffRef;
}

/** The staff row behind an existing entry (also a removed person), for the permission check. */
export async function staffOfRow(db: Db, id: string): Promise<StaffRef> {
  const [s] = await db`select id::text, name, dept, incharge_id::text from public.staff where id = ${id}::uuid`;
  return (s as unknown as StaffRef) ?? { id, name: '', dept: '', incharge_id: null };
}

/** Is this person the caller or in the caller's team? (INCHARGE / STAFF view of one staff row.) */
export function inMyScope(c: Ctx, s: { id: string; incharge_id: string | null }): boolean {
  if (seesAll(c)) return true;
  if (!c.user.staffId) return false;
  if (c.user.role === 'INCHARGE') return s.id === c.user.staffId || c.user.teamIds.includes(s.id);
  return s.id === c.user.staffId;
}

/** May this login make or change entries for this staff member? */
export function assertMayActFor(c: Ctx, s: StaffRef): void {
  if (inMyScope(c, s)) return;
  throw forbidden(c.user.role === 'INCHARGE'
    ? 'An incharge can only make entries for themselves and the staff in their team.'
    : 'You can only make entries for yourself.');
}

/** The staff member a STAFF / INCHARGE login acts as when the form sends none (or for STAFF, always). */
export function ownStaffId(c: Ctx, sent: string | null): string | null {
  if (c.user.role === 'STAFF') return c.user.staffId;
  return sent || c.user.staffId;
}
