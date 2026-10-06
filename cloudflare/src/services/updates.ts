// Daily updates: what each person did today and how many clients they met. ADMIN / ACCOUNTS see everyone; INCHARGE
// and STAFF see their own department (the team's "today's filling status"). STAFF and INCHARGE write only their own.
import type { Ctx } from '../api/context';
import { Check, date, int, obj, queryDate, str } from '../api/validate';
import { addDays, todayIst } from '../domain/dates';
import { audit } from './audit';
import { assertMayActFor, deptScope, loadStaff, seesAll } from './scope';
import { forbidden } from '../domain/errors';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));

/** ?from= ?to= (update date), both optional. */
export async function listUpdates(c: Ctx) {
  const from = queryDate(c.url, 'from');
  const to = queryDate(c.url, 'to');
  const { sql } = c;
  const rows = await sql`
    select u.id::text, u.update_date, u.staff_id::text, s.name as staff_name, u.dept, u.update_text, u.clients_met, u.created_at
    from public.daily_updates u join public.staff s on s.id = u.staff_id
    where true ${deptScope(c, 'u')}
      ${from ? sql`and u.update_date >= ${from}` : sql``} ${to ? sql`and u.update_date <= ${to}` : sql``}
    order by u.update_date desc, u.created_at desc`;
  return rows.map((r) => ({
    id: r.id, date: r.update_date, staffId: r.staff_id, staffName: r.staff_name, dept: r.dept, updateText: r.update_text,
    clientMetCount: Number(r.clients_met), createdAt: iso(r.created_at),
  }));
}

/** POST /daily-updates {date, staffId?, updateText, clientMetCount} */
export async function createUpdate(c: Ctx, body: unknown) {
  const b = obj(body);
  const d = date(b.date);
  const text = str(b.updateText);
  const met = int(b.clientMetCount) ?? 0;
  const ch = new Check();
  ch.notNull('date', d);
  const today = todayIst();
  if (d && d > today) ch.fail('date', 'cannot be in the future');
  if (d && d < addDays(today, -60)) ch.fail('date', 'can be at most 60 days back');
  ch.notBlank('updateText', text);
  ch.maxLen('updateText', text, 2000);
  ch.min('clientMetCount', met, 0);
  ch.max('clientMetCount', met, 500);
  ch.done();
  // STAFF and INCHARGE write their own update; ADMIN / ACCOUNTS name the person.
  const sent = str(b.staffId);
  const staffId = seesAll(c) ? sent : c.user.staffId;
  if (!seesAll(c) && sent && sent !== c.user.staffId) throw forbidden('You can only post your own daily update.');
  if (!staffId) throw forbidden('Your login is not linked to a staff member yet. Ask the admin to put your email in Staff mapping.');
  const staff = await loadStaff(c.sql, staffId);
  assertMayActFor(c, staff);
  const id = await c.sql.begin(async (tx) => {
    const [r] = await tx`insert into public.daily_updates (update_date, staff_id, dept, update_text, clients_met, created_by)
      values (${d}, ${staff.id}::uuid, ${staff.dept}, ${text!.trim()}, ${met},
              ${/^[0-9a-fA-F-]{36}$/.test(c.user.id) ? c.user.id : null}::uuid)
      returning id::text, created_at`;
    await audit(tx, c.user.id, 'CREATE', 'daily_updates', r.id, null, { date: d, dept: staff.dept, clientsMet: met });
    return r;
  });
  return { id: id.id, date: d, staffId: staff.id, staffName: staff.name, dept: staff.dept, updateText: text!.trim(), clientMetCount: met,
    createdAt: iso(id.created_at) };
}
