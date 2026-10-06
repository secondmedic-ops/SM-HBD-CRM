// API checks run by the rehearsal against the real Worker and a database built from the migrations.
// Each check names what the team would notice if it broke. Users get their role the way real logins do:
// ADMIN from user_roles, ACCOUNTS from the accounts team list, INCHARGE / STAFF from the email on their staff row.
const USERS = {
  admin: '00000000-0000-4000-8000-000000000001',
  accounts: '00000000-0000-4000-8000-000000000002',
  incharge: '00000000-0000-4000-8000-000000000003', // Manoj, AIROLI incharge
  staff: '00000000-0000-4000-8000-000000000004', // Supriya, AIROLI team
  other: '00000000-0000-4000-8000-000000000005', // Nihal, MDSA team
  norole: '00000000-0000-4000-8000-000000000006',
};
const email = (who) => `${who}@rehearsal.test`;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function todayIst(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function runApiTests({ base, token, sql, wrongKey }) {
  const failed = [];
  let total = 0;
  const check = (name, ok, detail = '') => { total++; if (!ok) failed.push(name + (detail ? ` - ${detail}` : '')); };
  const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

  for (const [who, id] of Object.entries(USERS)) {
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${email(who)}, 'authenticated', 'authenticated')
              on conflict (id) do nothing`;
  }
  await sql`insert into public.user_roles (user_id, role) values (${USERS.admin}, 'ADMIN') on conflict (user_id) do update set role = 'ADMIN'`;
  const tok = {};
  for (const [who, id] of Object.entries(USERS)) tok[who] = await token(id, email(who));

  async function call(who, method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (who) headers.Authorization = 'Bearer ' + (tok[who] ?? who);
    const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: r.status, body: json };
  }

  // ---- Login is required -------------------------------------------------------------------------------------------
  for (const p of ['/api/v1/revenue', '/api/v1/staff', '/api/v1/outstanding', '/api/v1/daily-updates', '/api/v1/me',
    '/api/v1/admin/accounts-logins', '/api/v1/unknown']) {
    eq(`no login: GET ${p} is 401`, (await call(null, 'GET', p)).status, 401);
  }
  eq('no login: POST revenue is 401', (await call(null, 'POST', '/api/v1/revenue', {})).status, 401);
  eq('forged token is 401', (await call(await token(USERS.admin, 'x@y', { key: wrongKey }), 'GET', '/api/v1/staff')).status, 401);
  eq('expired token is 401', (await call(await token(USERS.admin, 'x@y', { exp: Math.floor(Date.now() / 1000) - 60 }), 'GET', '/api/v1/staff')).status, 401);
  eq('token for another audience is 401', (await call(await token(USERS.admin, 'x@y', { aud: 'anon' }), 'GET', '/api/v1/staff')).status, 401);
  eq('401 message', (await call(null, 'GET', '/api/v1/me')).body?.message, 'Please log in again (missing or expired session).');
  eq('health is public', (await call(null, 'GET', '/api/v1/health')).status, 200);

  // ---- No role yet ------------------------------------------------------------------------------------------------
  const nr = await call('norole', 'GET', '/api/v1/me');
  check('me without role: 200 and no role', nr.status === 200 && !('role' in nr.body) && nr.body.email === email('norole'), JSON.stringify(nr.body));
  eq('no role: revenue 403', (await call('norole', 'GET', '/api/v1/revenue')).status, 403);
  eq('admin me', (await call('admin', 'GET', '/api/v1/me')).body?.role, 'ADMIN');

  // ---- Staff mapping links logins -------------------------------------------------------------------------------
  const staff0 = (await call('admin', 'GET', '/api/v1/staff')).body;
  eq('staff list from the migration', staff0.length, 10);
  const byName = (list, n) => list.find((s) => s.name === n);
  const manoj = byName(staff0, 'Manoj'), supriya = byName(staff0, 'Supriya'), sakshi = byName(staff0, 'Sakshi'),
    nihal = byName(staff0, 'Nihal'), vandana = byName(staff0, 'Vandana');
  eq('incharge cannot change staff', (await call('incharge', 'PUT', `/api/v1/staff/${manoj.id}`, { email: email('incharge') })).status, 403);
  eq('admin links Manoj', (await call('admin', 'PUT', `/api/v1/staff/${manoj.id}`, { email: email('incharge') })).body?.email, email('incharge'));
  await call('admin', 'PUT', `/api/v1/staff/${supriya.id}`, { email: email('staff') });
  await call('admin', 'PUT', `/api/v1/staff/${nihal.id}`, { email: email('other') });
  const dup = await call('admin', 'PUT', `/api/v1/staff/${sakshi.id}`, { email: email('staff').toUpperCase() });
  eq('same email on two staff rows: 409', dup.status, 409);
  eq('accounts email added', (await call('admin', 'POST', '/api/v1/admin/accounts-logins', { email: ' Accounts@Rehearsal.TEST ' })).body?.email, email('accounts'));
  eq('bad accounts email: 400', (await call('admin', 'POST', '/api/v1/admin/accounts-logins', { email: 'nope' })).status, 400);

  const meI = (await call('incharge', 'GET', '/api/v1/me')).body;
  eq('incharge role from staff row', [meI.role, meI.dept, meI.staffId], ['INCHARGE', 'AIROLI', manoj.id]);
  const meS = (await call('staff', 'GET', '/api/v1/me')).body;
  eq('team member role from staff row', [meS.role, meS.dept, meS.staffId], ['STAFF', 'AIROLI', supriya.id]);
  eq('accounts role from accounts list', (await call('accounts', 'GET', '/api/v1/me')).body?.role, 'ACCOUNTS');
  const asStaff = (await call('staff', 'GET', '/api/v1/staff')).body;
  check('staff list: no emails for non-admins', asStaff.length === 10 && asStaff.every((s) => !('email' in s) && !('hasLogin' in s)), JSON.stringify(asStaff[0]));
  check('staff list: admin sees email + login status', byName((await call('admin', 'GET', '/api/v1/staff')).body, 'Manoj')?.hasLogin === true);

  // ---- Departments ----------------------------------------------------------------------------------------------
  const depts = (await call('staff', 'GET', '/api/v1/departments')).body;
  eq('departments', depts.map((d) => d.name), ['AIROLI', 'MDSA', 'CORPORATE', 'BD', 'CAMPAIGN']);
  eq('MDSA target', depts[1].target, 700000);
  eq('staff cannot set a target', (await call('staff', 'PUT', '/api/v1/departments/BD', { target: 1 })).status, 403);
  eq('negative target: 400', (await call('admin', 'PUT', '/api/v1/departments/BD', { target: -1 })).status, 400);
  eq('admin sets BD target', (await call('admin', 'PUT', '/api/v1/departments/BD', { target: 650000 })).body?.target, 650000);
  eq('unknown department: 404', (await call('admin', 'PUT', '/api/v1/departments/XYZ', { target: 1 })).status, 404);

  // ---- Staff add / remove ---------------------------------------------------------------------------------------
  const bad = await call('admin', 'POST', '/api/v1/staff', { dept: 'NOPE', individualTarget: -5 });
  eq('new staff validation', bad.body?.fieldErrors, { name: 'must not be blank', individualTarget: 'must be greater than or equal to 0' });
  eq('new staff in unknown dept: 400', (await call('admin', 'POST', '/api/v1/staff', { name: 'X', dept: 'NOPE' })).body?.fieldErrors, { dept: 'is not a department' });
  const added = await call('admin', 'POST', '/api/v1/staff', { name: '  Ritu   Sharma ', dept: 'bd', role: 'Team', designation: 'BDE', project: 'BD Growth', individualTarget: 250000, email: 'ritu@rehearsal.test' });
  eq('new staff: 201 and tidy name', [added.status, added.body?.name, added.body?.dept, added.body?.hasLogin], [201, 'Ritu Sharma', 'BD', false]);
  eq('remove staff: 204', (await call('admin', 'DELETE', `/api/v1/staff/${vandana.id}`)).status, 204);
  check('removed staff left the list', !byName((await call('admin', 'GET', '/api/v1/staff')).body, 'Vandana'));

  // ---- Revenue entries ------------------------------------------------------------------------------------------
  const D = todayIst(-2);
  const e1 = await call('staff', 'POST', '/api/v1/revenue', { date: D, staffId: sakshi.id, client: 'Apollo Clinic', type: 'Individual',
    amount: 10000, cost: 9999, paymentStatus: 'Outstanding', dueDate: todayIst(10) });
  eq('staff entry is always their own', [e1.status, e1.body?.staffId, e1.body?.paymentStatus, e1.body?.amountReceived], [201, supriya.id, 'Outstanding', 0]);
  check('staff entry: no cost in the answer', e1.body && !('cost' in e1.body), JSON.stringify(e1.body));
  const e2 = await call('incharge', 'POST', '/api/v1/revenue', { date: D, staffId: sakshi.id, client: 'Fortis Vashi', type: 'Corporate',
    amount: '20000.50', cost: 4000, isNewClient: true, paymentStatus: 'Partly paid', amountReceived: 5000, slipImage: PNG });
  eq('incharge entry for own department', [e2.status, e2.body?.staffName, e2.body?.paymentStatus, e2.body?.amount, e2.body?.cost], [201, 'Sakshi', 'Partly paid', 20000.5, 4000]);
  check('slip saved as an image id', typeof e2.body?.slipId === 'string', JSON.stringify(e2.body));
  eq('incharge cannot enter for another department', (await call('incharge', 'POST', '/api/v1/revenue', { date: D, staffId: nihal.id, client: 'X', type: 'Individual', amount: 1, paymentStatus: 'Paid' })).status, 403);
  const e3 = await call('admin', 'POST', '/api/v1/revenue', { date: D, staffId: nihal.id, client: 'Ranchi Hospital', type: 'Corporate', amount: 50000, cost: 10000, paymentStatus: 'Paid' });
  eq('admin entry fully paid', [e3.status, e3.body?.dept, e3.body?.amountReceived], [201, 'MDSA', 50000]);
  const v = await call('admin', 'POST', '/api/v1/revenue', { date: todayIst(3), staffId: nihal.id, client: ' ', type: 'Individual', amount: 0, paymentStatus: 'Paid' });
  eq('revenue validation', v.body?.fieldErrors, { date: 'cannot be in the future', client: 'must not be blank', amount: 'must be greater than 0' });
  eq('partly paid needs a sum below the amount', (await call('admin', 'POST', '/api/v1/revenue', { date: D, staffId: nihal.id, client: 'Y', type: 'Individual', amount: 100, paymentStatus: 'Partly paid', amountReceived: 100 })).status, 400);
  eq('unknown payment status: malformed', (await call('admin', 'POST', '/api/v1/revenue', { date: D, staffId: nihal.id, client: 'Y', type: 'Individual', amount: 100, paymentStatus: 'Maybe' })).body?.message, 'Malformed JSON request');
  eq('not an image: 400', (await call('admin', 'POST', '/api/v1/revenue', { date: D, staffId: nihal.id, client: 'Y', type: 'Individual', amount: 100, paymentStatus: 'Paid', slipImage: 'data:text/html;base64,PGI+' })).status, 400);

  const listS = (await call('staff', 'GET', '/api/v1/revenue')).body;
  eq('staff sees only own entries', listS.map((r) => r.client), ['Apollo Clinic']);
  const listI = (await call('incharge', 'GET', '/api/v1/revenue')).body;
  eq('incharge sees the department', listI.map((r) => r.client).sort(), ['Apollo Clinic', 'Fortis Vashi']);
  eq('other department sees none of AIROLI', (await call('other', 'GET', '/api/v1/revenue')).body.map((r) => r.client), ['Ranchi Hospital']);
  eq('accounts sees all', (await call('accounts', 'GET', '/api/v1/revenue')).body.length, 3);
  eq('date filter', (await call('admin', 'GET', `/api/v1/revenue?from=${todayIst(-1)}`)).body.length, 0);
  eq('bad date filter: 400', (await call('admin', 'GET', '/api/v1/revenue?from=yesterday')).status, 400);

  // ---- Images -----------------------------------------------------------------------------------------------------
  const img = await call('incharge', 'GET', `/api/v1/attachments/${e2.body.slipId}`);
  eq('slip image for the incharge', [img.status, img.body?.dataUrl], [200, PNG]);
  eq('slip image hidden from another department', (await call('other', 'GET', `/api/v1/attachments/${e2.body.slipId}`)).status, 404);
  eq('slip image hidden from a team member who does not own it', (await call('staff', 'GET', `/api/v1/attachments/${e2.body.slipId}`)).status, 404);
  eq('garbage id: 404', (await call('admin', 'GET', '/api/v1/attachments/abc')).status, 404);

  // ---- Outstanding --------------------------------------------------------------------------------------------------
  const outS = (await call('staff', 'GET', '/api/v1/outstanding')).body;
  eq('outstanding made from the staff entry', outS.map((o) => [o.client, o.amount, o.amountPaid, o.status, o.revenueEntryId]),
    [['Apollo Clinic', 10000, 0, 'Pending', e1.body.id]]);
  const outI = (await call('incharge', 'GET', '/api/v1/outstanding')).body;
  eq('partly paid entry: rest is outstanding', outI.find((o) => o.client === 'Fortis Vashi')?.amount, 15000.5);
  eq('fully paid entry has no outstanding', (await call('other', 'GET', '/api/v1/outstanding')).body.length, 0);
  const o1 = outS[0];
  eq('another department cannot receive it', (await call('other', 'POST', `/api/v1/outstanding/${o1.id}/receive`, { amount: 1 })).status, 403);
  const rc = await call('staff', 'POST', `/api/v1/outstanding/${o1.id}/receive`, { amount: 4000 });
  eq('payment received', [rc.status, rc.body?.amountPaid, rc.body?.status], [200, 4000, 'Pending']);
  const r1 = (await call('staff', 'GET', '/api/v1/revenue')).body[0];
  eq('entry follows the payment', [r1.amountReceived, r1.paymentStatus], [4000, 'Partly paid']);
  eq('more than due: 400', (await call('staff', 'POST', `/api/v1/outstanding/${o1.id}/receive`, { amount: '6000.01' })).body?.message, 'Only Rs 6000.00 is still due on this payment.');

  // Edit the entry: amount up to 12000, received stays 4000 (collected on the outstanding).
  const up = await call('staff', 'PUT', `/api/v1/revenue/${e1.body.id}`, { date: D, client: 'Apollo Clinic Vashi', type: 'Individual', amount: 12000, cost: 1,
    paymentStatus: 'Partly paid', amountReceived: 4000 });
  eq('staff edits own entry', [up.status, up.body?.amount, up.body?.amountReceived], [200, 12000, 4000]);
  const o1b = (await call('staff', 'GET', '/api/v1/outstanding')).body[0];
  eq('outstanding follows the edit', [o1b.amount, o1b.amountPaid, o1b.client], [12000, 4000, 'Apollo Clinic Vashi']);
  eq('received below collected: 400', (await call('staff', 'PUT', `/api/v1/revenue/${e1.body.id}`, { date: D, client: 'A', type: 'Individual', amount: 12000,
    paymentStatus: 'Partly paid', amountReceived: 1000 })).status, 400);
  eq('team member cannot edit someone else\'s entry', (await call('staff', 'PUT', `/api/v1/revenue/${e2.body.id}`, { date: D, client: 'A', type: 'Individual', amount: 1, paymentStatus: 'Paid' })).status, 403);
  const [costRow] = await sql`select cost::text from public.revenue_entries where id = ${e1.body.id}::uuid`;
  eq('staff never sets cost', costRow.cost, '0.00');
  const paid = await call('admin', 'PUT', `/api/v1/revenue/${e1.body.id}`, { date: D, staffId: supriya.id, client: 'Apollo Clinic Vashi', type: 'Individual', amount: 12000, cost: 3000, paymentStatus: 'Paid' });
  eq('admin marks it paid', [paid.body?.paymentStatus, paid.body?.cost], ['Paid', 3000]);
  eq('outstanding shows paid', (await call('staff', 'GET', '/api/v1/outstanding')).body[0]?.status, 'Paid');

  const man = await call('other', 'POST', '/api/v1/outstanding', { client: 'Old dues', staffId: supriya.id, amount: 7000, dueDate: todayIst(5), screenshot: PNG });
  eq('manual outstanding: always own for a team member', [man.status, man.body?.staffId, man.body?.dept], [201, nihal.id, 'MDSA']);
  eq('screenshot visible to its owner', (await call('other', 'GET', `/api/v1/attachments/${man.body.screenshotId}`)).status, 200);

  eq('team member cannot delete entries', (await call('staff', 'DELETE', `/api/v1/revenue/${e1.body.id}`)).status, 403);
  eq('incharge cannot delete another department\'s entry', (await call('incharge', 'DELETE', `/api/v1/revenue/${e3.body.id}`)).status, 403);
  eq('incharge deletes in own department', (await call('incharge', 'DELETE', `/api/v1/revenue/${e2.body.id}`)).status, 204);
  check('its outstanding went with it', !(await call('incharge', 'GET', '/api/v1/outstanding')).body.some((o) => o.client === 'Fortis Vashi'));
  eq('its slip image is gone', (await sql`select count(*)::int as n from public.attachments where id = ${e2.body.slipId}::uuid`)[0].n, 0);

  // ---- Daily updates ------------------------------------------------------------------------------------------------
  const today = todayIst();
  const du = await call('staff', 'POST', '/api/v1/daily-updates', { date: today, updateText: 'Met 3 clinics', clientMetCount: 3 });
  eq('team member posts own update', [du.status, du.body?.staffId, du.body?.clientMetCount], [201, supriya.id, 3]);
  eq('cannot post for someone else', (await call('staff', 'POST', '/api/v1/daily-updates', { date: today, staffId: sakshi.id, updateText: 'x', clientMetCount: 1 })).status, 403);
  await call('other', 'POST', '/api/v1/daily-updates', { date: today, updateText: 'Ranchi visits', clientMetCount: 2 });
  eq('admin without a staff row must name the person', (await call('admin', 'POST', '/api/v1/daily-updates', { date: today, updateText: 'x', clientMetCount: 1 })).status, 403);
  eq('admin posts for a person', (await call('admin', 'POST', '/api/v1/daily-updates', { date: today, staffId: sakshi.id, updateText: 'Covered for Sakshi', clientMetCount: 0 })).status, 201);
  eq('update validation', (await call('staff', 'POST', '/api/v1/daily-updates', { date: todayIst(1), updateText: '', clientMetCount: -1 })).body?.fieldErrors,
    { date: 'cannot be in the future', updateText: 'must not be blank', clientMetCount: 'must be greater than or equal to 0' });
  eq('team sees own department\'s updates', (await call('staff', 'GET', '/api/v1/daily-updates')).body.map((u) => u.staffName).sort(), ['Sakshi', 'Supriya']);
  eq('accounts sees all updates', (await call('accounts', 'GET', '/api/v1/daily-updates')).body.length, 3);

  // ---- Clients and visits --------------------------------------------------------------------------------------------
  const cl1 = await call('staff', 'POST', '/api/v1/clients', { name: '  Vashi   Heart Clinic ', type: 'Corporate', category: 'Clinic',
    contactPerson: 'Dr Rao', phone: '+91 98765-43210', email: 'Desk@Clinic.example', city: 'Navi Mumbai', pincode: '400703', staffId: nihal.id });
  eq('team member adds a client, always as owner', [cl1.status, cl1.body?.name, cl1.body?.staffId, cl1.body?.dept, cl1.body?.phone, cl1.body?.status],
    [201, 'Vashi Heart Clinic', supriya.id, 'AIROLI', '9876543210', 'Lead']);
  eq('same phone typed differently: 409', (await call('other', 'POST', '/api/v1/clients', { name: 'Copy', phone: '09876543210' })).body?.message,
    'This phone number is already on a client managed by Supriya.');
  eq('client validation', (await call('staff', 'POST', '/api/v1/clients', { name: '', phone: '123', pincode: '12', email: 'x' })).body?.fieldErrors,
    { name: 'must not be blank', phone: 'must be a 10-13 digit phone number', email: 'must be a well-formed email address', pincode: 'must be 6 digits' });
  const cl2 = await call('other', 'POST', '/api/v1/clients', { name: 'Ranchi Diagnostics', type: 'Corporate' });
  eq('other department client', cl2.status, 201);
  const cl3 = await call('incharge', 'POST', '/api/v1/clients', { name: 'Airoli Corporate Park', staffId: sakshi.id });
  eq('incharge adds a client for a team member', [cl3.status, cl3.body?.staffName], [201, 'Sakshi']);
  eq('incharge cannot give a client to another department', (await call('incharge', 'POST', '/api/v1/clients', { name: 'X', staffId: nihal.id })).status, 403);
  eq('team member sees only own clients', (await call('staff', 'GET', '/api/v1/clients')).body.map((x) => x.name), ['Vashi Heart Clinic']);
  eq('incharge sees the department', (await call('incharge', 'GET', '/api/v1/clients')).body.map((x) => x.name), ['Airoli Corporate Park', 'Vashi Heart Clinic']);
  eq('admin sees all clients', (await call('admin', 'GET', '/api/v1/clients')).body.length, 3);
  eq('client search', (await call('admin', 'GET', '/api/v1/clients?q=ranchi')).body.map((x) => x.name), ['Ranchi Diagnostics']);
  eq('someone else\'s client is not found', (await call('other', 'PUT', `/api/v1/clients/${cl1.body.id}`, { status: 'Active' })).status, 404);
  eq('team member cannot hand a client over', (await call('staff', 'PUT', `/api/v1/clients/${cl1.body.id}`, { staffId: sakshi.id })).status, 403);
  const ed = await call('staff', 'PUT', `/api/v1/clients/${cl1.body.id}`, { status: 'Active', notes: 'Cardiology OPD, 40 patients a day' });
  eq('owner edits the client, phone kept', [ed.status, ed.body?.status, ed.body?.phone, ed.body?.city], [200, 'Active', '9876543210', 'Navi Mumbai']);

  const vbad = await call('staff', 'POST', '/api/v1/visits', { clientId: cl1.body.id, date: todayIst(1), nextFollowUp: todayIst(-5) });
  eq('visit validation', vbad.body?.fieldErrors, { date: 'cannot be in the future (put a future date in Next follow-up)', notes: 'write what happened (purpose or notes)',
    nextFollowUp: 'cannot be before the visit' });
  const v1 = await call('staff', 'POST', '/api/v1/visits', { clientId: cl1.body.id, date: todayIst(-1), kind: 'Meeting', purpose: 'Health camp proposal',
    notes: 'Asked for corporate rates', nextFollowUp: todayIst(3) });
  eq('visit logged', [v1.status, v1.body?.staffId, v1.body?.clientName, v1.body?.kind], [201, supriya.id, 'Vashi Heart Clinic', 'Meeting']);
  eq('visit on someone else\'s client: 404', (await call('other', 'POST', '/api/v1/visits', { clientId: cl1.body.id, date: todayIst(), notes: 'x' })).status, 404);
  eq('cannot log a visit as someone else', (await call('staff', 'POST', '/api/v1/visits', { clientId: cl1.body.id, date: todayIst(), notes: 'x', staffId: sakshi.id })).status, 403);
  const v2 = await call('incharge', 'POST', '/api/v1/visits', { clientId: cl1.body.id, date: todayIst(), kind: 'Call', notes: 'Follow-up call' });
  eq('incharge logs a call on a department client', [v2.status, v2.body?.staffName], [201, 'Manoj']);
  const cls = (await call('staff', 'GET', '/api/v1/clients')).body[0] ?? {};
  eq('client shows visits, last visit and next follow-up', [cls.visitCount, cls.lastVisit, cls.nextFollowUp ?? null], [2, todayIst(), null]);
  eq('visits of a client', (await call('staff', 'GET', `/api/v1/visits?clientId=${cl1.body.id}`)).body.map((x) => x.kind), ['Call', 'Meeting']);
  eq('other department sees none of these visits', (await call('other', 'GET', '/api/v1/visits')).body.length, 0);
  eq('owner edits a visit', (await call('staff', 'PUT', `/api/v1/visits/${v2.body.id}`, { date: todayIst(), kind: 'Call', notes: 'Call back', nextFollowUp: todayIst(7) })).body?.nextFollowUp, todayIst(7));
  eq('other department cannot delete it', (await call('other', 'DELETE', `/api/v1/visits/${v2.body.id}`)).status, 404);

  // Revenue entry for a client: the client's name is used; a client the caller cannot see is refused.
  const rcl = await call('staff', 'POST', '/api/v1/revenue', { date: D, clientId: cl1.body.id, client: 'typed name', type: 'Corporate', amount: 3000, paymentStatus: 'Paid' });
  eq('revenue entry linked to a client', [rcl.status, rcl.body?.client, rcl.body?.clientId], [201, 'Vashi Heart Clinic', cl1.body.id]);
  eq('revenue for someone else\'s client: 400', (await call('other', 'POST', '/api/v1/revenue', { date: D, clientId: cl1.body.id, client: 'x', type: 'Corporate', amount: 1, paymentStatus: 'Paid' })).body?.fieldErrors,
    { clientId: 'is not one of your clients' });
  eq('client with revenue cannot be deleted', (await call('staff', 'DELETE', `/api/v1/clients/${cl1.body.id}`)).status, 409);
  eq('client without revenue is deleted with its visits', (await call('incharge', 'DELETE', `/api/v1/clients/${cl3.body.id}`)).status, 204);
  eq('admin hands a client to another department', (await call('admin', 'PUT', `/api/v1/clients/${cl2.body.id}`, { staffId: sakshi.id })).body?.dept, 'AIROLI');
  eq('previous owner no longer sees it', (await call('other', 'GET', '/api/v1/clients')).body.length, 0);

  // ---- Logins (Supabase Auth admin API, stand-in in the rehearsal) ---------------------------------------------------
  eq('non-admin cannot make logins', (await call('accounts', 'POST', '/api/v1/admin/logins', { email: 'ritu@rehearsal.test', password: 'longenough' })).status, 403);
  eq('login only for known emails', (await call('admin', 'POST', '/api/v1/admin/logins', { email: 'stranger@rehearsal.test', password: 'longenough' })).body?.fieldErrors,
    { email: 'put this email on a staff row or in Accounts team logins first' });
  eq('short password: 400', (await call('admin', 'POST', '/api/v1/admin/logins', { email: 'ritu@rehearsal.test', password: 'short' })).status, 400);
  eq('new login for a staff email', (await call('admin', 'POST', '/api/v1/admin/logins', { email: 'Ritu@rehearsal.test', password: 'longenough' })).body, { email: 'ritu@rehearsal.test', created: true });
  eq('existing login gets a new password', (await call('admin', 'POST', '/api/v1/admin/logins', { email: email('staff'), password: 'longenough2' })).body?.created, false);
  check('login status shows on the staff row', byName((await call('admin', 'GET', '/api/v1/staff')).body, 'Ritu Sharma')?.hasLogin === true);
  eq('accounts list', (await call('admin', 'GET', '/api/v1/admin/accounts-logins')).body.map((a) => [a.email, a.hasLogin]), [[email('accounts'), true]]);
  eq('remove accounts email: 204', (await call('admin', 'DELETE', `/api/v1/admin/accounts-logins/${encodeURIComponent(email('accounts'))}`)).status, 204);
  eq('removed accounts login has no role', (await call('accounts', 'GET', '/api/v1/revenue')).status, 403);

  // ---- Audit and misc ---------------------------------------------------------------------------------------------
  const audits = await sql`select table_name, action, coalesce(before::text, '') || coalesce(after::text, '') as body from public.audit_log`;
  check('changes are audited', audits.some((a) => a.table_name === 'revenue_entries' && a.action === 'CREATE') && audits.some((a) => a.action === 'RECEIVE'));
  const PERSONAL = /Apollo|Fortis|Ranchi|Vashi|Airoli Corporate|98765|Dr Rao|Cardiology|Health camp|rehearsal\.test|Ritu/;
  check('no client names, phones, notes or emails in the audit log', !audits.some((a) => PERSONAL.test(a.body)),
    audits.filter((a) => PERSONAL.test(a.body)).map((a) => a.body).join(' | '));
  eq('unknown endpoint with login: 404', (await call('admin', 'GET', '/api/v1/nothing-here')).status, 404);
  eq('wrong method: 405', (await call('admin', 'DELETE', '/api/v1/revenue')).status, 405);
  eq('malformed JSON: 400', (await call('admin', 'POST', '/api/v1/staff', 'not json')).body?.message, 'Malformed JSON request');

  return { failed, total };
}
