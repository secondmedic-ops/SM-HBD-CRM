// Departments (monthly targets) and the staff list (Staff mapping / Staff directory). Everyone may read the team;
// only ADMIN sees work emails and login status, and only ADMIN changes anything here.
import Big from 'big.js';
import type { Ctx } from '../api/context';
import { clearAccessCache } from '../api/auth';
import { Check, decimal, EMAIL_RE, hasText, obj, oneOf, str, uuidParam } from '../api/validate';
import { ApiError, notFound } from '../domain/errors';
import { money, num } from '../domain/money';
import { audit } from './audit';

const MAX_TARGET = '1000000000';
const STAFF_ROLES = ['Incharge', 'Team'] as const;

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// ---- Departments -------------------------------------------------------------------------------------------------

export async function listDepartments(c: Ctx) {
  const rows = await c.sql`select name, target::text from public.departments order by sort_order, name`;
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

function staffJson(r: Record<string, any>, admin: boolean) {
  return {
    id: r.id,
    name: r.name,
    dept: r.dept,
    role: r.role,
    designation: r.designation,
    project: r.project,
    individualTarget: n(r.individual_target),
    email: admin ? r.email : null,
    hasLogin: admin ? !!r.has_login : null,
  };
}

const selectStaff = (c: Ctx) => c.sql`
  select s.id::text, s.name, s.dept, s.role, s.designation, s.project, s.individual_target::text, s.email,
         (s.email is not null and exists (select 1 from auth.users u where lower(u.email) = lower(s.email))) as has_login
  from public.staff s join public.departments d on d.name = s.dept`;

export async function listStaff(c: Ctx) {
  const rows = await c.sql`${selectStaff(c)} where s.active order by d.sort_order, (s.role = 'Incharge') desc, s.name`;
  return rows.map((r) => staffJson(r, c.user.role === 'ADMIN'));
}

interface StaffInput {
  name?: string;
  dept?: string;
  role?: (typeof STAFF_ROLES)[number];
  designation?: string;
  project?: string;
  individualTarget?: Big;
  email?: string | null;
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
  if (full || dept !== null) {
    ch.notBlank('dept', dept);
    if (hasText(dept)) out.dept = dept.trim().toUpperCase();
  }
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
  ch.done();
  return out;
}

async function assertDept(c: Ctx, dept: string | undefined) {
  if (!dept) return;
  const [d] = await c.sql`select 1 from public.departments where name = ${dept}`;
  if (!d) throw new ApiError(400, 'Validation failed', { dept: 'is not a department' });
}

async function assertEmailFree(c: Ctx, email: string | null | undefined, self: string | null) {
  if (!email) return;
  const [s] = await c.sql`select id::text, name from public.staff where active and lower(email) = ${email}
                          and (${self}::uuid is null or id <> ${self}::uuid)`;
  if (s) throw new ApiError(409, `This email is already on ${s.name}'s row.`);
}

/** Audit snapshot without names or emails (personal data stays out of audit_log). */
const auditStaff = (s: Record<string, any>) => ({ dept: s.dept, role: s.role, individualTarget: n(s.individual_target ?? s.individualTarget),
  linked: !!s.email });

export async function createStaff(c: Ctx, body: unknown) {
  const v = parseStaff(body, true);
  await assertDept(c, v.dept);
  await assertEmailFree(c, v.email, null);
  const row = await c.sql.begin(async (tx) => {
    const [r] = await tx`insert into public.staff (name, dept, role, designation, project, individual_target, email)
      values (${v.name!}, ${v.dept!}, ${v.role!}, ${v.designation!}, ${v.project!}, ${v.individualTarget!.toFixed(2)}, ${v.email ?? null})
      returning id::text`;
    await audit(tx, c.user.id, 'CREATE', 'staff', r.id, null, auditStaff({ ...v, individual_target: num(v.individualTarget!) }));
    return r;
  });
  clearAccessCache();
  const [s] = await c.sql`${selectStaff(c)} where s.id = ${row.id}::uuid`;
  return staffJson(s, true);
}

export async function updateStaff(c: Ctx, body: unknown) {
  const id = uuidParam(c.params.id, 'Staff member');
  const v = parseStaff(body, false);
  await assertDept(c, v.dept);
  await assertEmailFree(c, v.email, id);
  await c.sql.begin(async (tx) => {
    const [before] = await tx`select dept, role, individual_target::text, email from public.staff where id = ${id}::uuid and active for update`;
    if (!before) throw notFound('Staff member', id);
    const after = {
      name: v.name, dept: v.dept ?? before.dept, role: v.role ?? before.role, designation: v.designation, project: v.project,
      individual_target: v.individualTarget ? v.individualTarget.toFixed(2) : before.individual_target,
      email: v.email !== undefined ? v.email : before.email,
    };
    await tx`update public.staff set
        name = coalesce(${v.name ?? null}, name), dept = ${after.dept}, role = ${after.role},
        designation = coalesce(${v.designation ?? null}, designation), project = coalesce(${v.project ?? null}, project),
        individual_target = ${after.individual_target}, email = ${after.email}, updated_at = now()
      where id = ${id}::uuid`;
    await audit(tx, c.user.id, 'UPDATE', 'staff', id, auditStaff(before), auditStaff(after));
  });
  clearAccessCache();
  const [s] = await c.sql`${selectStaff(c)} where s.id = ${id}::uuid`;
  return staffJson(s, true);
}

/** Removes a person from the team. Their past entries stay (reports keep their name); their login stops working here. */
export async function deleteStaff(c: Ctx) {
  const id = uuidParam(c.params.id, 'Staff member');
  await c.sql.begin(async (tx) => {
    const [before] = await tx`select dept, role, individual_target::text, email from public.staff where id = ${id}::uuid and active for update`;
    if (!before) throw notFound('Staff member', id);
    await tx`update public.staff set active = false, updated_at = now() where id = ${id}::uuid`;
    await audit(tx, c.user.id, 'DELETE', 'staff', id, auditStaff(before), null);
  });
  clearAccessCache();
}
