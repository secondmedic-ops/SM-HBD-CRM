// Revenue entries and outstanding payments. One transaction saves an entry, its outstanding row (when it is not fully
// paid), its slip image and the audit rows. Money is exact (big.js); the rules are in domain/payments.ts.
// STAFF never see or set cost / profit: cost is left out of their JSON and kept as it was when they edit.
import Big from 'big.js';
import type { Ctx } from '../api/context';
import { bool, Check, date, decimal, obj, oneOf, queryDate, str, uuidParam } from '../api/validate';
import type { Tx } from '../db';
import { todayIst } from '../domain/dates';
import { ApiError, notFound } from '../domain/errors';
import { d0, money } from '../domain/money';
import { outstandingFor, PAYMENT_STATUSES, receive, receivedFor, statusOf } from '../domain/payments';
import { audit } from './audit';
import { checkImage, deleteImages, saveImage } from './attachments';
import { assertMayActFor, loadStaff, ownStaffId, rowScope, staffOfRow } from './scope';
import { visibleClient } from './clients';

const TYPES = ['Individual', 'Corporate'] as const;
const OLDEST = '2020-01-01';
const MAX_AMOUNT = '1000000000';
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));

const ENTRY_COLUMNS = (c: Ctx) => c.sql`
  r.id::text, r.entry_date, r.staff_id::text, s.name as staff_name, r.dept, r.client, r.type, r.amount::text,
  r.cost::text, r.is_new_client, r.amount_received::text, r.due_date, r.slip_id::text, r.client_id::text, r.created_at`;

/** One entry as the screens use it. STAFF get no cost (profit stays with incharges, accounts and admin). */
function entryJson(c: Ctx, r: Record<string, any>) {
  return {
    id: r.id, date: r.entry_date, staffId: r.staff_id, staffName: r.staff_name, dept: r.dept, client: r.client, type: r.type,
    amount: n(r.amount), cost: c.user.role === 'STAFF' ? null : n(r.cost), isNewClient: r.is_new_client,
    paymentStatus: statusOf(d0(r.amount), d0(r.amount_received)), amountReceived: n(r.amount_received), dueDate: r.due_date,
    slipId: r.slip_id, clientId: r.client_id, createdAt: iso(r.created_at),
  };
}

// ---- Lists -------------------------------------------------------------------------------------------------------

/** ?from= ?to= (entry date), both optional. */
export async function listRevenue(c: Ctx) {
  const from = queryDate(c.url, 'from');
  const to = queryDate(c.url, 'to');
  const { sql } = c;
  const rows = await sql`
    select ${ENTRY_COLUMNS(c)}
    from public.revenue_entries r join public.staff s on s.id = r.staff_id
    where true ${rowScope(c, 'r')}
      ${from ? sql`and r.entry_date >= ${from}` : sql``} ${to ? sql`and r.entry_date <= ${to}` : sql``}
    order by r.entry_date desc, r.created_at desc`;
  return rows.map((r) => entryJson(c, r));
}

export async function listOutstanding(c: Ctx) {
  const rows = await c.sql`
    select o.id::text, o.revenue_entry_id::text, o.client, o.staff_id::text, s.name as staff_name, o.dept, o.amount::text,
           o.amount_paid::text, o.due_date, o.screenshot_id::text, o.created_at
    from public.outstanding_payments o join public.staff s on s.id = o.staff_id
    where true ${rowScope(c, 'o')}
    order by (o.amount_paid < o.amount) desc, o.due_date, o.created_at desc`;
  return rows.map((r) => ({
    id: r.id,
    revenueEntryId: r.revenue_entry_id,
    client: r.client,
    staffId: r.staff_id,
    staffName: r.staff_name,
    dept: r.dept,
    amount: n(r.amount),
    amountPaid: n(r.amount_paid),
    dueDate: r.due_date,
    status: n(r.amount_paid) >= n(r.amount) ? 'Paid' : 'Pending',
    screenshotId: r.screenshot_id,
    createdAt: iso(r.created_at),
  }));
}

// ---- Revenue entry save ------------------------------------------------------------------------------------------

interface EntryInput {
  date: string;
  staffId: string | null;
  client: string;
  type: (typeof TYPES)[number];
  amount: Big;
  cost: Big | null;
  isNewClient: boolean;
  status: (typeof PAYMENT_STATUSES)[number];
  amountReceived: Big | null;
  dueDate: string | null;
  slip: ReturnType<typeof checkImage>;
  removeSlip: boolean;
  /** A client from the Clients list (its name becomes the entry's client name). */
  clientId: string | null;
}

function parseEntry(body: unknown): EntryInput {
  const b = obj(body);
  const ch = new Check();
  const d = date(b.date);
  const client = str(b.client);
  const type = oneOf(b.type, TYPES);
  const amount = decimal(b.amount);
  const cost = decimal(b.cost);
  const status = oneOf(b.paymentStatus, PAYMENT_STATUSES);
  const received = decimal(b.amountReceived);
  const due = date(b.dueDate === '' ? null : b.dueDate);
  ch.notNull('date', d);
  const today = todayIst();
  if (d && d > today) ch.fail('date', 'cannot be in the future');
  if (d && d < OLDEST) ch.fail('date', `cannot be before ${OLDEST}`);
  ch.notBlank('client', client);
  ch.maxLen('client', client, 200);
  ch.notNull('type', type);
  ch.notNull('amount', amount);
  if (amount && amount.lte(0)) ch.fail('amount', 'must be greater than 0');
  ch.decMax('amount', amount, MAX_AMOUNT);
  ch.decMin('cost', cost, '0');
  ch.decMax('cost', cost, MAX_AMOUNT);
  ch.notNull('paymentStatus', status);
  ch.decMin('amountReceived', received, '0');
  ch.done();
  return {
    date: d!, staffId: str(b.staffId), client: client!.trim().replace(/\s+/g, ' '), type: type!, amount: money(amount!),
    cost: cost === null ? null : money(cost), isNewClient: bool(b.isNewClient) ?? false, status: status!,
    amountReceived: received === null ? null : money(received), dueDate: due,
    slip: checkImage('slipImage', b.slipImage), removeSlip: bool(b.removeSlip) ?? false,
    clientId: str(b.clientId) || null,
  };
}

/** Audit snapshot: amounts and status, never the client name or the image. */
const auditEntry = (e: { dept: string; type: string; amount: Big | string; cost: Big | string; received: Big | string; date: string }) => ({
  date: e.date, dept: e.dept, type: e.type, amount: Number(String(e.amount)), cost: Number(String(e.cost)),
  amountReceived: Number(String(e.received)), status: statusOf(new Big(String(e.amount)), new Big(String(e.received))),
});

async function saveOutstanding(tx: Tx, c: Ctx, entryId: string, e: EntryInput, received: Big, staff: { id: string; dept: string },
  prev: { id: string; amount: Big; paid: Big } | null) {
  const want = outstandingFor(e.amount, received, prev && { amount: prev.amount, paid: prev.paid });
  const due = e.dueDate ?? e.date;
  if (!want) {
    if (prev) await tx`delete from public.outstanding_payments where id = ${prev.id}::uuid`;
    return;
  }
  if (prev) {
    await tx`update public.outstanding_payments set client = ${e.client}, staff_id = ${staff.id}::uuid, dept = ${staff.dept},
               amount = ${want.amount.toFixed(2)}, due_date = coalesce(${e.dueDate}::date, due_date), updated_at = now()
             where id = ${prev.id}::uuid`;
  } else {
    await tx`insert into public.outstanding_payments (revenue_entry_id, client, staff_id, dept, amount, amount_paid, due_date, created_by)
             values (${entryId}::uuid, ${e.client}, ${staff.id}::uuid, ${staff.dept}, ${want.amount.toFixed(2)}, 0, ${due},
                     ${uidOf(c)}::uuid)`;
  }
}

const uidOf = (c: Ctx) => (/^[0-9a-fA-F-]{36}$/.test(c.user.id) ? c.user.id : null);

/** An entry naming a client from the Clients list takes that client's name; the client must be one the caller sees. */
async function resolveClient(c: Ctx, e: EntryInput) {
  if (!e.clientId) return;
  if (!/^[0-9a-fA-F-]{36}$/.test(e.clientId)) throw new ApiError(400, 'Validation failed', { clientId: 'is not one of your clients' });
  try {
    e.client = (await visibleClient(c.sql, c, e.clientId)).name;
  } catch {
    throw new ApiError(400, 'Validation failed', { clientId: 'is not one of your clients' });
  }
}

export async function createRevenue(c: Ctx, body: unknown) {
  const e = parseEntry(body);
  await resolveClient(c, e);
  const staff = await loadStaff(c.sql, ownStaffId(c, e.staffId));
  assertMayActFor(c, staff);
  const received = receivedFor(e.status, e.amount, e.amountReceived);
  const cost = c.user.role === 'STAFF' ? new Big(0) : (e.cost ?? new Big(0));
  const id = await c.sql.begin(async (tx) => {
    const slipId = e.slip ? await saveImage(tx, c.user.id, e.slip) : null;
    const [r] = await tx`
      insert into public.revenue_entries (entry_date, staff_id, dept, client, type, amount, cost, is_new_client, amount_received,
                                          due_date, slip_id, client_id, created_by)
      values (${e.date}, ${staff.id}::uuid, ${staff.dept}, ${e.client}, ${e.type}, ${e.amount.toFixed(2)}, ${cost.toFixed(2)},
              ${e.isNewClient}, ${received.toFixed(2)}, ${e.dueDate}, ${slipId}::uuid, ${e.clientId}::uuid, ${uidOf(c)}::uuid)
      returning id::text`;
    await saveOutstanding(tx, c, r.id, e, received, staff, null);
    await audit(tx, c.user.id, 'CREATE', 'revenue_entries', r.id, null,
      auditEntry({ date: e.date, dept: staff.dept, type: e.type, amount: e.amount, cost, received }));
    return String(r.id);
  });
  return entryById(c, id);
}

export async function updateRevenue(c: Ctx, body: unknown) {
  const id = uuidParam(c.params.id, 'Revenue entry');
  const e = parseEntry(body);
  await resolveClient(c, e);
  const staff = await loadStaff(c.sql, ownStaffId(c, e.staffId));
  assertMayActFor(c, staff);
  await c.sql.begin(async (tx) => {
    const [old] = await tx`
      select r.entry_date, r.staff_id::text, r.dept, r.type, r.amount::text, r.cost::text, r.amount_received::text, r.slip_id::text,
             o.id::text as out_id, o.amount::text as out_amount, o.amount_paid::text as out_paid
      from public.revenue_entries r left join public.outstanding_payments o on o.revenue_entry_id = r.id
      where r.id = ${id}::uuid for update of r`;
    if (!old) throw notFound('Revenue entry', id);
    // The entry as it is now must be the caller's too (a STAFF cannot take over someone else's entry).
    assertMayActFor(c, await staffOfRow(tx, old.staff_id));
    const received = receivedFor(e.status, e.amount, e.amountReceived);
    const cost = c.user.role === 'STAFF' || e.cost === null ? new Big(old.cost) : e.cost;
    const prev = old.out_id ? { id: old.out_id, amount: d0(old.out_amount), paid: d0(old.out_paid) } : null;
    if (prev) await tx`select 1 from public.outstanding_payments where id = ${prev.id}::uuid for update`;
    let slipId: string | null = old.slip_id;
    if (e.slip) slipId = await saveImage(tx, c.user.id, e.slip);
    else if (e.removeSlip) slipId = null;
    await tx`
      update public.revenue_entries set entry_date = ${e.date}, staff_id = ${staff.id}::uuid, dept = ${staff.dept}, client = ${e.client},
        type = ${e.type}, amount = ${e.amount.toFixed(2)}, cost = ${cost.toFixed(2)}, is_new_client = ${e.isNewClient},
        amount_received = ${received.toFixed(2)}, due_date = ${e.dueDate}, slip_id = ${slipId}::uuid, client_id = ${e.clientId}::uuid,
        updated_at = now()
      where id = ${id}::uuid`;
    await saveOutstanding(tx, c, id, e, received, staff, prev);
    if (old.slip_id && old.slip_id !== slipId) await deleteImages(tx, [old.slip_id]);
    await audit(tx, c.user.id, 'UPDATE', 'revenue_entries', id,
      auditEntry({ date: old.entry_date, dept: old.dept, type: old.type, amount: old.amount, cost: old.cost, received: old.amount_received }),
      auditEntry({ date: e.date, dept: staff.dept, type: e.type, amount: e.amount, cost, received }));
  });
  return entryById(c, id);
}

export async function deleteRevenue(c: Ctx) {
  const id = uuidParam(c.params.id, 'Revenue entry');
  await c.sql.begin(async (tx) => {
    const [old] = await tx`
      select r.entry_date, r.staff_id::text, r.dept, r.type, r.amount::text, r.cost::text, r.amount_received::text, r.slip_id::text,
             o.screenshot_id::text as shot_id
      from public.revenue_entries r left join public.outstanding_payments o on o.revenue_entry_id = r.id
      where r.id = ${id}::uuid for update of r`;
    if (!old) throw notFound('Revenue entry', id);
    assertMayActFor(c, await staffOfRow(tx, old.staff_id));
    await tx`delete from public.revenue_entries where id = ${id}::uuid`; // its outstanding row goes with it (cascade)
    await deleteImages(tx, [old.slip_id, old.shot_id]);
    await audit(tx, c.user.id, 'DELETE', 'revenue_entries', id,
      auditEntry({ date: old.entry_date, dept: old.dept, type: old.type, amount: old.amount, cost: old.cost, received: old.amount_received }), null);
  });
}

async function entryById(c: Ctx, id: string) {
  const [r] = await c.sql`select ${ENTRY_COLUMNS(c)} from public.revenue_entries r join public.staff s on s.id = r.staff_id
                          where r.id = ${id}::uuid`;
  if (!r) throw notFound('Revenue entry', id);
  return entryJson(c, r);
}

// ---- Outstanding -------------------------------------------------------------------------------------------------

/** POST /outstanding {client, staffId, amount, dueDate, screenshot?}: a payment due that has no revenue entry here. */
export async function createOutstanding(c: Ctx, body: unknown) {
  const b = obj(body);
  const client = str(b.client);
  const amount = decimal(b.amount);
  const due = date(b.dueDate);
  const ch = new Check();
  ch.notBlank('client', client);
  ch.maxLen('client', client, 200);
  ch.notNull('amount', amount);
  if (amount && amount.lte(0)) ch.fail('amount', 'must be greater than 0');
  ch.decMax('amount', amount, MAX_AMOUNT);
  ch.notNull('dueDate', due);
  ch.done();
  const shot = checkImage('screenshot', b.screenshot);
  const staff = await loadStaff(c.sql, ownStaffId(c, str(b.staffId)));
  assertMayActFor(c, staff);
  const id = await c.sql.begin(async (tx) => {
    const shotId = shot ? await saveImage(tx, c.user.id, shot) : null;
    const [r] = await tx`
      insert into public.outstanding_payments (client, staff_id, dept, amount, amount_paid, due_date, screenshot_id, created_by)
      values (${client!.trim()}, ${staff.id}::uuid, ${staff.dept}, ${money(amount!).toFixed(2)}, 0, ${due}, ${shotId}::uuid, ${uidOf(c)}::uuid)
      returning id::text`;
    await audit(tx, c.user.id, 'CREATE', 'outstanding_payments', r.id, null, { dept: staff.dept, amount: Number(money(amount!).toString()), dueDate: due });
    return String(r.id);
  });
  return outstandingById(c, id);
}

/** POST /outstanding/{id}/receive {amount}: a payment came in; a linked revenue entry's received amount goes up too. */
export async function receiveOutstanding(c: Ctx, body: unknown) {
  const id = uuidParam(c.params.id, 'Outstanding payment');
  const b = obj(body);
  const x = decimal(b.amount);
  const ch = new Check();
  ch.notNull('amount', x);
  ch.done();
  await c.sql.begin(async (tx) => {
    const [o] = await tx`select staff_id::text, dept, amount::text, amount_paid::text, revenue_entry_id::text
                         from public.outstanding_payments where id = ${id}::uuid for update`;
    if (!o) throw notFound('Outstanding payment', id);
    assertMayActFor(c, await staffOfRow(tx, o.staff_id));
    const pay = money(x!);
    const paid = receive({ amount: d0(o.amount), paid: d0(o.amount_paid) }, pay);
    await tx`update public.outstanding_payments set amount_paid = ${paid.toFixed(2)}, updated_at = now() where id = ${id}::uuid`;
    if (o.revenue_entry_id) {
      const [r] = await tx`update public.revenue_entries set amount_received = least(amount, amount_received + ${pay.toFixed(2)}), updated_at = now()
                           where id = ${o.revenue_entry_id}::uuid returning amount_received::text`;
      if (!r) throw new ApiError(409, 'The revenue entry of this payment was changed meanwhile. Reload and try again.');
    }
    await audit(tx, c.user.id, 'RECEIVE', 'outstanding_payments', id, { amountPaid: Number(o.amount_paid) },
      { amountPaid: Number(paid.toString()), received: Number(pay.toString()) });
  });
  return outstandingById(c, id);
}

async function outstandingById(c: Ctx, id: string) {
  const [r] = await c.sql`
    select o.id::text, o.revenue_entry_id::text, o.client, o.staff_id::text, s.name as staff_name, o.dept, o.amount::text,
           o.amount_paid::text, o.due_date, o.screenshot_id::text, o.created_at
    from public.outstanding_payments o join public.staff s on s.id = o.staff_id where o.id = ${id}::uuid`;
  if (!r) throw notFound('Outstanding payment', id);
  return {
    id: r.id, revenueEntryId: r.revenue_entry_id, client: r.client, staffId: r.staff_id, staffName: r.staff_name, dept: r.dept,
    amount: n(r.amount), amountPaid: n(r.amount_paid), dueDate: r.due_date,
    status: n(r.amount_paid) >= n(r.amount) ? 'Paid' : 'Pending', screenshotId: r.screenshot_id, createdAt: iso(r.created_at),
  };
}
