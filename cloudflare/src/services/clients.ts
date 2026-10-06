// Clients and their visits. Each client has an owner (a staff member); who may see and manage it:
//   ADMIN / ACCOUNTS: every client;  INCHARGE: clients of their department;  STAFF: only clients they own.
// A client outside the caller's scope answers 404, as if it did not exist. Everyone who sees a client may change it and
// log / change / delete its visits; only ADMIN / ACCOUNTS / INCHARGE (own department) can hand a client to someone else.
// Audit rows carry status / type / department only, never names, phones, emails, addresses or visit notes.
import type { Ctx } from '../api/context';
import { Check, date, EMAIL_RE, obj, oneOf, queryDate, str, uuidParam } from '../api/validate';
import type { Db } from '../db';
import { addDays, todayIst } from '../domain/dates';
import { ApiError, forbidden, notFound } from '../domain/errors';
import { audit } from './audit';
import { assertMayActFor, loadStaff, rowScope, seesAll } from './scope';

export const CLIENT_TYPES = ['Individual', 'Corporate'] as const;
export const CLIENT_STATUSES = ['Lead', 'Active', 'Inactive'] as const;
export const VISIT_KINDS = ['Visit', 'Call', 'Meeting', 'Demo', 'Email', 'Other'] as const;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));
const uid = (c: Ctx) => (/^[0-9a-fA-F-]{36}$/.test(c.user.id) ? c.user.id : null);

/** Indian mobile / landline as digits: "+91 98765-43210" -> "9876543210". Null when empty. */
export function normalizePhone(v: string | null): string | null {
  if (v === null) return null;
  let d = v.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export interface ClientRow {
  id: string;
  name: string;
  staff_id: string;
  dept: string;
  status: string;
  type: string;
}

/** May this login see the client? (Same rule as rowScope, for a row already loaded.) */
function sees(c: Ctx, r: { staff_id: string; dept: string }): boolean {
  if (seesAll(c)) return true;
  if (c.user.role === 'INCHARGE') return !!c.user.dept && r.dept === c.user.dept;
  return !!c.user.staffId && r.staff_id === c.user.staffId;
}

/** A client the caller may see (optionally locked for update), else 404. */
export async function visibleClient(db: Db, c: Ctx, id: string, lock = false): Promise<ClientRow> {
  const rows = lock
    ? await db`select id::text, name, staff_id::text, dept, status, type from public.clients where id = ${id}::uuid for update`
    : await db`select id::text, name, staff_id::text, dept, status, type from public.clients where id = ${id}::uuid`;
  const r = rows[0] as unknown as ClientRow | undefined;
  if (!r || !sees(c, r)) throw notFound('Client', id);
  return r;
}

// ---- Clients -----------------------------------------------------------------------------------------------------

function clientJson(r: Record<string, any>) {
  return {
    id: r.id, name: r.name, type: r.type, category: r.category, contactPerson: r.contact_person, phone: r.phone, email: r.email,
    address: r.address, city: r.city, pincode: r.pincode, status: r.status, notes: r.notes,
    staffId: r.staff_id, staffName: r.staff_name, dept: r.dept,
    visitCount: Number(r.visit_count ?? 0), lastVisit: r.last_visit, nextFollowUp: r.next_follow_up, createdAt: iso(r.created_at),
  };
}

const CLIENT_SELECT = (c: Ctx) => c.sql`
  select cl.id::text, cl.name, cl.type, cl.category, cl.contact_person, cl.phone, cl.email, cl.address, cl.city, cl.pincode,
         cl.status, cl.notes, cl.staff_id::text, s.name as staff_name, cl.dept, cl.created_at,
         v.visit_count, v.last_visit, v.next_follow_up
  from public.clients cl
  join public.staff s on s.id = cl.staff_id
  left join lateral (
    select count(*) as visit_count, max(cv.visit_date) as last_visit,
           (select cv2.next_follow_up from public.client_visits cv2 where cv2.client_id = cl.id
            order by cv2.visit_date desc, cv2.created_at desc limit 1) as next_follow_up
    from public.client_visits cv where cv.client_id = cl.id) v on true`;

/** GET /clients ?q= (name / contact / phone / city) ?status= */
export async function listClients(c: Ctx) {
  const { sql } = c;
  const q = (c.url.searchParams.get('q') || '').trim().toLowerCase();
  const status = oneOf(c.url.searchParams.get('status') || null, CLIENT_STATUSES);
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  const rows = await sql`${CLIENT_SELECT(c)}
    where true ${rowScope(c, 'cl')}
      ${status ? sql`and cl.status = ${status}` : sql``}
      ${q ? sql`and (lower(cl.name) like ${like} or lower(cl.contact_person) like ${like} or coalesce(cl.phone, '') like ${like}
                     or lower(cl.city) like ${like})` : sql``}
    order by lower(cl.name)`;
  return rows.map(clientJson);
}

interface ClientInput {
  name?: string;
  type?: (typeof CLIENT_TYPES)[number];
  category?: string;
  contactPerson?: string;
  phone?: string | null;
  email?: string | null;
  address?: string;
  city?: string;
  pincode?: string | null;
  status?: (typeof CLIENT_STATUSES)[number];
  notes?: string;
  staffId?: string | null;
}

function parseClient(body: unknown, full: boolean): ClientInput {
  const b = obj(body);
  const ch = new Check();
  const out: ClientInput = {};
  const name = str(b.name);
  if (full || name !== null) {
    ch.notBlank('name', name);
    ch.maxLen('name', name, 200);
    if (name && name.trim()) out.name = name.trim().replace(/\s+/g, ' ');
  }
  if (b.type !== undefined || full) out.type = oneOf(b.type ?? 'Corporate', CLIENT_TYPES) ?? 'Corporate';
  if (b.status !== undefined || full) out.status = oneOf(b.status ?? 'Lead', CLIENT_STATUSES) ?? 'Lead';
  const texts = { category: 60, contactPerson: 120, address: 300, city: 80, notes: 2000 } as const;
  for (const [k, max] of Object.entries(texts) as [keyof typeof texts, number][]) {
    const v = str(b[k]);
    if (v !== null) { ch.maxLen(k, v, max); out[k] = v.trim(); } else if (full) out[k] = '';
  }
  if (b.phone !== undefined) {
    const p = normalizePhone(str(b.phone));
    if (p !== null && !/^\d{10,13}$/.test(p)) ch.fail('phone', 'must be a 10-13 digit phone number');
    out.phone = p;
  }
  if (b.email !== undefined) {
    const e = (str(b.email) ?? '').trim().toLowerCase();
    if (e) { ch.pattern('email', e, EMAIL_RE, 'must be a well-formed email address'); ch.maxLen('email', e, 200); }
    out.email = e || null;
  }
  if (b.pincode !== undefined) {
    const p = (str(b.pincode) ?? '').replace(/\s/g, '');
    if (p && !/^\d{6}$/.test(p)) ch.fail('pincode', 'must be 6 digits');
    out.pincode = p || null;
  }
  if (b.staffId !== undefined) out.staffId = str(b.staffId);
  ch.done();
  return out;
}

async function assertPhoneFree(c: Ctx, phone: string | null | undefined, self: string | null) {
  if (!phone) return;
  const [d] = await c.sql`select s.name as owner from public.clients cl join public.staff s on s.id = cl.staff_id
                          where cl.phone = ${phone} and (${self}::uuid is null or cl.id <> ${self}::uuid) limit 1`;
  if (d) throw new ApiError(409, `This phone number is already on a client managed by ${d.owner}.`);
}

/** Owner of a new / changed client: STAFF always themselves (a staffId they send for a new client is ignored); others
 *  may name someone they may act for. */
async function ownerFor(c: Ctx, sent: string | null | undefined, current: string | null) {
  if (c.user.role === 'STAFF') {
    // A new client is always the team member's own; handing an existing one over is for an incharge or the admin.
    if (current && sent && sent !== current) throw forbidden('Only an incharge or the admin can hand a client to someone else.');
    if (!current && !c.user.staffId) throw forbidden('Your login is not linked to a staff member yet. Ask the admin to put your email in Staff mapping.');
    return loadStaff(c.sql, current ?? c.user.staffId);
  }
  const id = sent || current || c.user.staffId;
  if (!id) throw new ApiError(400, 'Validation failed', { staffId: 'choose the staff member who manages this client' });
  const s = await loadStaff(c.sql, id);
  assertMayActFor(c, s);
  return s;
}

const auditClient = (r: { type?: string; status?: string; dept?: string }) => ({ type: r.type, status: r.status, dept: r.dept });

export async function createClient(c: Ctx, body: unknown) {
  const v = parseClient(body, true);
  const owner = await ownerFor(c, v.staffId, null);
  await assertPhoneFree(c, v.phone, null);
  const id = await c.sql.begin(async (tx) => {
    const [r] = await tx`
      insert into public.clients (name, type, category, contact_person, phone, email, address, city, pincode, status, notes,
                                  staff_id, dept, created_by)
      values (${v.name!}, ${v.type!}, ${v.category!}, ${v.contactPerson!}, ${v.phone ?? null}, ${v.email ?? null}, ${v.address!},
              ${v.city!}, ${v.pincode ?? null}, ${v.status!}, ${v.notes!}, ${owner.id}::uuid, ${owner.dept}, ${uid(c)}::uuid)
      returning id::text`;
    await audit(tx, c.user.id, 'CREATE', 'clients', r.id, null, auditClient({ ...v, dept: owner.dept }));
    return String(r.id);
  });
  return clientById(c, id);
}

export async function updateClient(c: Ctx, body: unknown) {
  const id = uuidParam(c.params.id, 'Client');
  const v = parseClient(body, false);
  const cur = await visibleClient(c.sql, c, id);
  const owner = v.staffId !== undefined ? await ownerFor(c, v.staffId, cur.staff_id) : null;
  await assertPhoneFree(c, v.phone, id);
  await c.sql.begin(async (tx) => {
    const before = await visibleClient(tx, c, id, true);
    await tx`update public.clients set
        name = coalesce(${v.name ?? null}, name), type = coalesce(${v.type ?? null}, type), category = coalesce(${v.category ?? null}, category),
        contact_person = coalesce(${v.contactPerson ?? null}, contact_person),
        phone = ${v.phone !== undefined ? v.phone : tx('phone')}, email = ${v.email !== undefined ? v.email : tx('email')},
        address = coalesce(${v.address ?? null}, address), city = coalesce(${v.city ?? null}, city),
        pincode = ${v.pincode !== undefined ? v.pincode : tx('pincode')}, status = coalesce(${v.status ?? null}, status),
        notes = coalesce(${v.notes ?? null}, notes),
        staff_id = ${owner ? owner.id : before.staff_id}::uuid, dept = ${owner ? owner.dept : before.dept}, updated_at = now()
      where id = ${id}::uuid`;
    await audit(tx, c.user.id, 'UPDATE', 'clients', id, auditClient(before),
      { ...auditClient({ type: v.type ?? before.type, status: v.status ?? before.status, dept: owner ? owner.dept : before.dept }),
        ownerChanged: !!owner && owner.id !== before.staff_id });
  });
  return clientById(c, id);
}

/** DELETE /clients/{id}: only while no revenue entry names the client (set it Inactive otherwise). Visits go with it. */
export async function deleteClient(c: Ctx) {
  const id = uuidParam(c.params.id, 'Client');
  await c.sql.begin(async (tx) => {
    const before = await visibleClient(tx, c, id, true);
    const [n] = await tx`select count(*)::int as n from public.revenue_entries where client_id = ${id}::uuid`;
    if (n.n > 0) throw new ApiError(409, `This client has ${n.n} revenue ${n.n === 1 ? 'entry' : 'entries'}; set the status to Inactive instead.`);
    await tx`delete from public.clients where id = ${id}::uuid`;
    await audit(tx, c.user.id, 'DELETE', 'clients', id, auditClient(before), null);
  });
}

async function clientById(c: Ctx, id: string) {
  const [r] = await c.sql`${CLIENT_SELECT(c)} where cl.id = ${id}::uuid`;
  if (!r) throw notFound('Client', id);
  return clientJson(r);
}

// ---- Visits ------------------------------------------------------------------------------------------------------

function visitJson(r: Record<string, any>) {
  return {
    id: r.id, clientId: r.client_id, clientName: r.client_name, staffId: r.staff_id, staffName: r.staff_name, date: r.visit_date,
    kind: r.kind, purpose: r.purpose, notes: r.notes, nextFollowUp: r.next_follow_up, createdAt: iso(r.created_at),
  };
}

const VISIT_SELECT = (c: Ctx) => c.sql`
  select v.id::text, v.client_id::text, cl.name as client_name, v.staff_id::text, s.name as staff_name, v.visit_date, v.kind,
         v.purpose, v.notes, v.next_follow_up, v.created_at
  from public.client_visits v join public.clients cl on cl.id = v.client_id join public.staff s on s.id = v.staff_id`;

/** GET /visits ?clientId= ?from= ?to= (visit date) */
export async function listVisits(c: Ctx) {
  const { sql } = c;
  const clientId = c.url.searchParams.get('clientId');
  if (clientId) uuidParam(clientId, 'Client');
  const from = queryDate(c.url, 'from');
  const to = queryDate(c.url, 'to');
  const rows = await sql`${VISIT_SELECT(c)}
    where true ${rowScope(c, 'cl')}
      ${clientId ? sql`and v.client_id = ${clientId}::uuid` : sql``}
      ${from ? sql`and v.visit_date >= ${from}` : sql``} ${to ? sql`and v.visit_date <= ${to}` : sql``}
    order by v.visit_date desc, v.created_at desc
    limit 2000`;
  return rows.map(visitJson);
}

interface VisitInput {
  date: string;
  kind: (typeof VISIT_KINDS)[number];
  purpose: string;
  notes: string;
  nextFollowUp: string | null;
}

function parseVisit(b: Record<string, any>): VisitInput {
  const ch = new Check();
  const d = date(b.date);
  const kind = oneOf(b.kind ?? 'Visit', VISIT_KINDS) ?? 'Visit';
  const purpose = (str(b.purpose) ?? '').trim();
  const notes = (str(b.notes) ?? '').trim();
  const next = date(b.nextFollowUp === '' ? null : b.nextFollowUp);
  ch.notNull('date', d);
  const today = todayIst();
  if (d && d > today) ch.fail('date', 'cannot be in the future (put a future date in Next follow-up)');
  if (d && d < addDays(today, -365)) ch.fail('date', 'can be at most a year back');
  ch.maxLen('purpose', purpose, 200);
  ch.maxLen('notes', notes, 2000);
  if (!purpose && !notes) ch.fail('notes', 'write what happened (purpose or notes)');
  if (next && d && next < d) ch.fail('nextFollowUp', 'cannot be before the visit');
  ch.done();
  return { date: d!, kind, purpose, notes, nextFollowUp: next };
}

/** Who made the visit: STAFF / INCHARGE themselves; ADMIN / ACCOUNTS the person sent, else the client's owner. */
async function visitorFor(c: Ctx, sent: string | null, client: ClientRow) {
  if (!seesAll(c)) {
    if (sent && sent !== c.user.staffId) throw forbidden('You can only log your own visits.');
    if (!c.user.staffId) throw forbidden('Your login is not linked to a staff member yet. Ask the admin to put your email in Staff mapping.');
    return c.user.staffId;
  }
  const s = await loadStaff(c.sql, sent || client.staff_id);
  return s.id;
}

/** POST /visits {clientId, date, kind, purpose, notes, nextFollowUp, staffId?} */
export async function createVisit(c: Ctx, body: unknown) {
  const b = obj(body);
  const clientId = str(b.clientId);
  if (!clientId || !/^[0-9a-fA-F-]{36}$/.test(clientId)) throw new ApiError(400, 'Validation failed', { clientId: 'must not be blank' });
  const v = parseVisit(b);
  const client = await visibleClient(c.sql, c, clientId);
  const staffId = await visitorFor(c, str(b.staffId), client);
  const id = await c.sql.begin(async (tx) => {
    const [r] = await tx`insert into public.client_visits (client_id, staff_id, visit_date, kind, purpose, notes, next_follow_up, created_by)
      values (${client.id}::uuid, ${staffId}::uuid, ${v.date}, ${v.kind}, ${v.purpose}, ${v.notes}, ${v.nextFollowUp}, ${uid(c)}::uuid)
      returning id::text`;
    await audit(tx, c.user.id, 'CREATE', 'client_visits', r.id, null, { date: v.date, kind: v.kind, dept: client.dept, followUp: !!v.nextFollowUp });
    return String(r.id);
  });
  return visitById(c, id);
}

async function visibleVisit(db: Db, c: Ctx, id: string) {
  const [v] = await db`select v.id::text, v.client_id::text, v.visit_date, v.kind from public.client_visits v where v.id = ${id}::uuid`;
  if (!v) throw notFound('Visit', id);
  try {
    await visibleClient(db, c, v.client_id);
  } catch {
    throw notFound('Visit', id);
  }
  return v;
}

export async function updateVisit(c: Ctx, body: unknown) {
  const id = uuidParam(c.params.id, 'Visit');
  const v = parseVisit(obj(body));
  await c.sql.begin(async (tx) => {
    const before = await visibleVisit(tx, c, id);
    await tx`update public.client_visits set visit_date = ${v.date}, kind = ${v.kind}, purpose = ${v.purpose}, notes = ${v.notes},
               next_follow_up = ${v.nextFollowUp}, updated_at = now() where id = ${id}::uuid`;
    await audit(tx, c.user.id, 'UPDATE', 'client_visits', id, { date: before.visit_date, kind: before.kind },
      { date: v.date, kind: v.kind, followUp: !!v.nextFollowUp });
  });
  return visitById(c, id);
}

export async function deleteVisit(c: Ctx) {
  const id = uuidParam(c.params.id, 'Visit');
  await c.sql.begin(async (tx) => {
    const before = await visibleVisit(tx, c, id);
    await tx`delete from public.client_visits where id = ${id}::uuid`;
    await audit(tx, c.user.id, 'DELETE', 'client_visits', id, { date: before.visit_date, kind: before.kind }, null);
  });
}

async function visitById(c: Ctx, id: string) {
  const [r] = await c.sql`${VISIT_SELECT(c)} where v.id = ${id}::uuid`;
  if (!r) throw notFound('Visit', id);
  return visitJson(r);
}
