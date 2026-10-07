// Departments (monthly targets) and the staff list (Staff mapping / My team / Staff directory). Everyone may read the
// team list. ADMIN changes anyone and sets who reports to which incharge (staff.incharge_id): a team member reports to
// an incharge, and an incharge may report to a senior incharge (no loops). An INCHARGE adds staff to
// their own team and changes their team members' details (not their role, department or incharge). Work emails and
// login status are shown to ADMIN for everyone and to an INCHARGE for their own team.
import Big from 'big.js';
import type { Ctx } from '../api/context';
import { clearAccessCache } from '../api/auth';
import { Check, decimal, EMAIL_RE, hasText, obj, oneOf, str, uuidParam } from '../api/validate';
import { ApiError, forbidden, notFound } from '../domain/errors';
import { money, num } from '../domain/money';
import { audit } from './audit';

const MAX_TARGET = '1000000000';
const STAFF_ROLES = ['Incharge', 'Team'] as const;

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// ---- Departments -------------------------------------------------------------------------------------------------

/** ADMIN / ACCOUNTS: all departments. INCHARGE / STAFF: only their own department (no other department's target). */
export async function listDepartments(c: Ctx) {
  const { sql } = c;
  const own = c.user.role === 'ADMIN' || c.user.role === 'ACCOUNTS' ? sql`` : sql`where name = ${c.user.dept ?? '-'}`;
  const rows = await sql`select name, target::text from public.departments ${own} order by sort_order, name`;
  return rows.map((r) => ({ name: r.name, target: n(r.target) }));
}

/** PUT /departments/{name} {target} */
export async function setDepartmentTarget(c: Ctx, body: unknown) {
  const b = obj(body);
  const target = decimal(b.target);
  const ch = new Check();
  ch.notNull('target', target);
  ch.decMin('target', target, '0');
  ch.decMax('target', target, MAX_TARGET);
  ch.done();
  const name = c.params.name;
  return c.sql.begin(async (tx) => {
    const [before] = await tx`select name, target::text from public.departments where name = ${name} for update`;
    if (!before) throw notFound('Department', name);
    const t = money(target!).toFixed(2);
    await tx`update public.departments set target = ${t}, updated_at = now() where name = ${name}`;
    await audit(tx, c.user.id, 'UPDATE', 'departments', name, { target: n(before.target) }, { target: Number(t) });
    return { name, target: Number(t) };
  });
}

// ---- Staff -------------------------------------------------------------------------------------------------------

function staffJson(r: Record<string, any>, showPrivate: boolean) {
  return {
    id: r.id,
    name: r.name,
    dept: r.dept,
    role: r.role,
    designation: r.designation,
    project: r.project,
    individualTarget: n(r.individual_target),
    inchargeId: r.incharge_id,
    inchargeName: r.incharge_name,
    email: showPrivate ? r.email : null,
    hasLogin: showPrivate ? !!r.has_login : null,
  };
}

/** Email and login status: ADMIN for everyone, an INCHARGE for themselves and their team. */
const showsPrivate = (c: Ctx, r: Record<string, any>) =>
  c.user.role === 'ADMIN' || (c.user.role === 'INCHARGE' && c.user.teamIds.includes(r.id));

const selectStaff = (c: Ctx) => c.sql`
  select s.id::text, s.name, s.dept, s.role, s.designation, s.project, s.individual_target::text, s.email,
         s.incharge_id::text, i.name as incharge_name,
         (s.email is not null and exists (select 1 from auth.users u where lower(u.email) = lower(s.email))) as has_login
  from public.staff s join public.departments d on d.name = s.dept
  left join public.staff i on i.id = s.incharge_id and i.active`;

/**
 * ADMIN / ACCOUNTS: everyone. INCHARGE: their department and their own team. STAFF: their department, themselves and
 * their incharge. Nobody else's department shows (Staff directory, filters, dashboard).
 */
export async function listStaff(c: Ctx) {
  const { sql } = c;
  const none = '00000000-0000-0000-0000-000000000000';
  const me = c.user.staffId ?? none;
  const scope = c.user.role === 'ADMIN' || c.user.role === 'ACCOUNTS' ? sql``
    : c.user.role === 'INCHARGE'
      ? sql`and (s.dept = ${c.user.dept ?? '-'} or s.id = ${me}::uuid or s.id::text in ${sql(c.user.teamIds.concat(['-']))})`
      : sql`and (s.dept = ${c.user.dept ?? '-'} or s.id = ${me}::uuid or s.id = ${c.user.inchargeId ?? none}::uuid)`;
  const rows = await sql`${selectStaff(c)} where s.active ${scope} order by d.sort_order, (s.role = 'Incharge') desc, s.name`;
  return rows.map((r) => staffJson(r, showsPrivate(c, r)));
}

interface StaffInput {
  name?: string;
  dept?: string;
  role?: (typeof STAFF_ROLES)[number];
  designation?: string;
  project?: string;
  individualTarget?: Big;
  email?: string | null;
  /** '' / null = reports to nobody. */
  inchargeId?: string | null;
}

/** Reads the fields that are present; `full` = all required fields must be there (create). */
function parseStaff(body: unknown, full: boolean): StaffInput {
  const b = obj(body);
  const ch = new Check();
  const out: StaffInput = {};
  const name = str(b.name);
  if (full || name !== null) {
    ch.notBlank('name', name);
    ch.maxLen('name', name, 80);
    if (hasText(name)) out.name = name.trim().replace(/\s+/g, ' ');
  }
  const dept = str(b.dept);
  if (dept !== null && dept.trim()) out.dept = dept.trim().toUpperCase();
  if (b.role !== undefined || full) {
    const role = oneOf(b.role ?? 'Team', STAFF_ROLES);
    out.role = role ?? 'Team';
  }
  for (const k of ['designation', 'project'] as const) {
    const v = str(b[k]);
    if (v !== null) {
      ch.maxLen(k, v, 120);
      out[k] = v.trim();
    } else if (full) out[k] = '';
  }
  const t = decimal(b.individualTarget);
  if (t !== null) {
    ch.decMin('individualTarget', t, '0');
    ch.decMax('individualTarget', t, MAX_TARGET);
    out.individualTarget = money(t);
  } else if (full) out.individualTarget = new Big(0);
  if (b.email !== undefined) {
    const e = (str(b.email) ?? '').trim().toLowerCase();
    if (e) ch.pattern('email', e, EMAIL_RE, 'must be a well-formed email address');
    out.email = e || null;
  }
  if (b.inchargeId !== undefined) {
    const i = (str(b.inchargeId) ?? '').trim();
    if (i && !/^[0-9a-fA-F-]{36}$/.test(i)) ch.fail('inchargeId', 'is not an incharge');
    out.inchargeId = i || null;
  }
  ch.done();
  return out;
}

async function assertDept(c: Ctx, dept: string | undefined) {
  if (!dept) return;
  const [d] = await c.sql`select 1 from public.departments where name = ${dept}`;
  if (!d) throw new ApiError(400, 'Validation failed', { dept: 'is not a department' });
}

/**
 * The incharge someone reports to: an active staff member with role Incharge, not the person themselves and not anyone
 * who (directly or further down) reports to that person, so the chain never loops.
 */
async function loadIncharge(c: Ctx, id: string, self: string | null): Promise<{ id: string; dept: string }> {
  const [i] = await c.sql`select id::text, dept from public.staff where id = ${id}::uuid and active and role = 'Incharge'`;
  if (!i || id === self) throw new ApiError(400, 'Validation failed', { inchargeId: 'is not an incharge' });
  if (self) {
    const [loop] = await c.sql`with recursive t(id) as (select ${self}::uuid union select s.id from public.staff s join t on s.incharge_id = t.id)
                               select 1 from t where id = ${id}::uuid`;
    if (loop) throw new ApiError(400, 'Validation failed', { inchargeId: 'reports to this person already (that would make a loop)' });
  }
  return i as unknown as { id: string; dept: string };
}

async function assertEmailFree(c: Ctx, email: string | null | undefined, self: string | null) {
  if (!email) return;
  const [s] = await c.sql`select id::text, name from public.staff where active and lower(email) = ${email}
                          and (${self}::uuid is null or id <> ${self}::uuid)`;
  if (s) throw new ApiError(409, `This email is already on ${s.name}'s row.`);
}

/** Audit snapshot without names or emails (personal data stays out of audit_log). */
const auditStaff = (s: Record<string, any>) => ({ dept: s.dept, role: s.role, individualTarget: n(s.individual_target ?? s.individualTarget),
  linked: !!s.email, inchargeId: s.incharge_id ?? s.inchargeId ?? null });

/**
 * POST /staff. ADMIN: anyone; a Team member may get an incharge (inchargeId), and then the incharge's department when
 * none is sent. INCHARGE: a Team member of their own team and department (role, department and incharge are set here).
 */
export async function createStaff(c: Ctx, body: unknown) {
  const v = parseStaff(body, true);
  if (c.user.role === 'INCHARGE') {
    if (!c.user.staffId || !c.user.dept) throw forbidden('Your login is not linked to your staff row yet. Ask the admin.');
    v.role = 'Team';
    v.dept = c.user.dept;
    v.inchargeId = c.user.staffId;
  } else {
    if (v.inchargeId) {
      const i = await loadIncharge(c, v.inchargeId, null);
      // A team member takes their incharge's department; an incharge keeps their own (they may report across departments).
      if (v.role === 'Team') v.dept ??= i.dept;
    }
  }
  if (!v.dept) throw new ApiError(400, 'Validation failed', { dept: 'must not be blank' });
  await assertDept(c, v.dept);
  await assertEmailFree(c, v.email, null);
  const row = await c.sql.begin(async (tx) => {
    const [r] = await tx`insert into public.staff (name, dept, role, designation, project, individual_target, email, incharge_id)
      values (${v.name!}, ${v.dept!}, ${v.role!}, ${v.designation!}, ${v.project!}, ${v.individualTarget!.toFixed(2)}, ${v.email ?? null},
              ${v.inchargeId ?? null}::uuid)
      returning id::text`;
    await audit(tx, c.user.id, 'CREATE', 'staff', r.id, null, auditStaff({ ...v, individual_target: num(v.individualTarget!) }));
    return r;
  });
  clearAccessCache();
  const [s] = await c.sql`${selectStaff(c)} where s.id = ${row.id}::uuid`;
  return staffJson(s, true);
}

/**
 * PUT /staff/{id} (only the fields sent). ADMIN: everything, incl. role and incharge (inchargeId '' = nobody; an incharge
 * may report to a senior incharge); a person who stops being an incharge leaves their team without an incharge. INCHARGE: name, designation, project, target and
 * email of their own team members.
 */
export async function updateStaff(c: Ctx, body: unknown) {
  const id = uuidParam(c.params.id, 'Staff member');
  const v = parseStaff(body, false);
  const [cur] = await c.sql`select id::text, dept, role, incharge_id::text from public.staff where id = ${id}::uuid and active`;
  if (!cur) throw notFound('Staff member', id);
  if (c.user.role === 'INCHARGE') {
    if (cur.id === c.user.staffId) throw forbidden('Only the admin can change an incharge\'s own row.');
    const mine = c.user.teamIds.includes(cur.id);
    if (!mine) throw notFound('Staff member', id);
    const changes = (v.role !== undefined && v.role !== cur.role) || (v.dept !== undefined && v.dept !== cur.dept)
      || (v.inchargeId !== undefined && v.inchargeId !== cur.incharge_id);
    if (changes) throw forbidden('Only the admin can change a person\'s role, department or incharge.');
    v.role = undefined; v.dept = undefined; v.inchargeId = undefined;
  }
  const role = v.role ?? cur.role;
  if (v.inchargeId) {
    const i = await loadIncharge(c, v.inchargeId, id);
    if (role === 'Team' && v.dept === undefined && body && (body as any).dept === undefined) v.dept = i.dept;
  }
  await assertDept(c, v.dept);
  await assertEmailFree(c, v.email, id);
  await c.sql.begin(async (tx) => {
    const [before] = await tx`select dept, role, individual_target::text, email, incharge_id::text from public.staff
                              where id = ${id}::uuid and active for update`;
    if (!before) throw notFound('Staff member', id);
    const after = {
      dept: v.dept ?? before.dept, role, individual_target: v.individualTarget ? v.individualTarget.toFixed(2) : before.individual_target,
      email: v.email !== undefined ? v.email : before.email, incharge_id: v.inchargeId !== undefined ? v.inchargeId : before.incharge_id,
    };
    await tx`update public.staff set
        name = coalesce(${v.name ?? null}, name), dept = ${after.dept}, role = ${after.role},
        designation = coalesce(${v.designation ?? null}, designation), project = coalesce(${v.project ?? null}, project),
        individual_target = ${after.individual_target}, email = ${after.email}, incharge_id = ${after.incharge_id}::uuid, updated_at = now()
      where id = ${id}::uuid`;
    // No longer an incharge: their team members report to nobody until the admin assigns them.
    if (before.role === 'Incharge' && role !== 'Incharge') {
      await tx`update public.staff set incharge_id = null, updated_at = now() where incharge_id = ${id}::uuid`;
    }
    await audit(tx, c.user.id, 'UPDATE', 'staff', id, auditStaff(before), auditStaff(after));
  });
  clearAccessCache();
  const [s] = await c.sql`${selectStaff(c)} where s.id = ${id}::uuid`;
  return staffJson(s, showsPrivate(c, s));
}

/**
 * Removes a person from the team. Their past entries stay (reports keep their name); their login stops working here.
 * ADMIN: anyone (a removed incharge's team reports to nobody). INCHARGE: their own team members.
 */
export async function deleteStaff(c: Ctx) {
  const id = uuidParam(c.params.id, 'Staff member');
  await c.sql.begin(async (tx) => {
    const [before] = await tx`select id::text, dept, role, individual_target::text, email, incharge_id::text from public.staff
                              where id = ${id}::uuid and active for update`;
    if (!before) throw notFound('Staff member', id);
    if (c.user.role === 'INCHARGE' && (before.id === c.user.staffId || !c.user.teamIds.includes(before.id))) {
      if (before.id === c.user.staffId) throw forbidden('Only the admin can remove an incharge.');
      throw notFound('Staff member', id);
    }
    await tx`update public.staff set active = false, updated_at = now() where id = ${id}::uuid`;
    if (before.role === 'Incharge') await tx`update public.staff set incharge_id = null, updated_at = now() where incharge_id = ${id}::uuid`;
    await audit(tx, c.user.id, 'DELETE', 'staff', id, auditStaff(before), null);
  });
  clearAccessCache();
}
