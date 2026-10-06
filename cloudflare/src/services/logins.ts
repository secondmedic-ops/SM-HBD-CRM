// Staff mapping (ADMIN): the accounts team emails (role ACCOUNTS) and the passwords of logins.
// A login is a Supabase Auth user. "Create login" makes it (or sets a new password when it exists) through the Auth
// admin API with the Worker secret SUPABASE_SERVICE_ROLE_KEY (set once with STAFF-LOGINS-KEY.bat). Only emails that
// are on a staff row or in the accounts team list can get a login here, so a login always has a role.
import type { Ctx } from '../api/context';
import { clearAccessCache, supabaseBase } from '../api/auth';
import { Check, EMAIL_RE, obj, str } from '../api/validate';
import { ApiError, notFound } from '../domain/errors';
import { audit } from './audit';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));

export async function listAccountsLogins(c: Ctx) {
  const rows = await c.sql`
    select a.email, a.created_at, exists (select 1 from auth.users u where lower(u.email) = a.email) as has_login
    from public.accounts_logins a order by a.email`;
  return rows.map((r) => ({ email: r.email, hasLogin: !!r.has_login, createdAt: iso(r.created_at) }));
}

function emailOf(v: unknown): string {
  const e = (str(v) ?? '').trim().toLowerCase();
  const ch = new Check();
  ch.notBlank('email', e);
  ch.pattern('email', e, EMAIL_RE, 'must be a well-formed email address');
  ch.maxLen('email', e, 200);
  ch.done();
  return e;
}

/** POST /admin/accounts-logins {email} */
export async function addAccountsLogin(c: Ctx, body: unknown) {
  const email = emailOf(obj(body).email);
  await c.sql.begin(async (tx) => {
    const [r] = await tx`insert into public.accounts_logins (email, added_by)
                         values (${email}, ${/^[0-9a-fA-F-]{36}$/.test(c.user.id) ? c.user.id : null}::uuid)
                         on conflict (email) do nothing returning email`;
    if (r) await audit(tx, c.user.id, 'CREATE', 'accounts_logins', null, null, { role: 'ACCOUNTS' });
  });
  clearAccessCache();
  const [r] = await c.sql`select a.email, a.created_at, exists (select 1 from auth.users u where lower(u.email) = a.email) as has_login
                          from public.accounts_logins a where a.email = ${email}`;
  return { email: r.email, hasLogin: !!r.has_login, createdAt: iso(r.created_at) };
}

/** DELETE /admin/accounts-logins/{email}: the login stays, but no longer has the ACCOUNTS role. */
export async function removeAccountsLogin(c: Ctx) {
  const email = (c.params.email || '').trim().toLowerCase();
  await c.sql.begin(async (tx) => {
    const [r] = await tx`delete from public.accounts_logins where email = ${email} returning email`;
    if (!r) throw notFound('Accounts login', email);
    await audit(tx, c.user.id, 'DELETE', 'accounts_logins', null, { role: 'ACCOUNTS' }, null);
  });
  clearAccessCache();
}

async function authAdmin(c: Ctx, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const key = (c.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const base = supabaseBase(c.env);
  if (!key || !base) {
    throw new ApiError(503, 'Creating logins needs the Supabase secret key once: double-click STAFF-LOGINS-KEY.bat in the SM-HBD-CRM folder, then try again after the deploy (about 5 minutes).');
  }
  // New secret keys (sb_secret_...) go on the apikey header only; a legacy service_role key is a JWT and also goes as Bearer.
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/auth/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}
const authMessage = (j: any) => String(j?.msg || j?.message || j?.error_description || j?.error || 'Supabase Auth refused it');

/** POST /admin/logins {email, password}: makes the login, or sets a new password when it exists already. */
export async function setLogin(c: Ctx, body: unknown) {
  const b = obj(body);
  const email = emailOf(b.email);
  const password = str(b.password) ?? '';
  const ch = new Check();
  if (password.length < 8) ch.fail('password', 'at least 8 characters');
  else if (password.length > 72) ch.fail('password', 'at most 72 characters');
  ch.done();
  const [known] = await c.sql`
    select exists (select 1 from public.staff s where s.active and lower(s.email) = ${email}) as staff,
           exists (select 1 from public.accounts_logins a where a.email = ${email}) as accounts,
           (select u.id::text from auth.users u where lower(u.email) = ${email} limit 1) as user_id`;
  if (!known.staff && !known.accounts) {
    throw new ApiError(400, 'Validation failed', { email: 'put this email on a staff row or in Accounts team logins first' });
  }
  let created = false;
  if (known.user_id) {
    const r = await authAdmin(c, 'PUT', `/admin/users/${known.user_id}`, { password });
    if (r.status >= 300) throw new ApiError(r.status === 422 ? 400 : 502, 'Password not changed: ' + authMessage(r.json));
  } else {
    const r = await authAdmin(c, 'POST', '/admin/users', { email, password, email_confirm: true });
    if (r.status >= 300) throw new ApiError(r.status === 422 ? 400 : 502, 'Login not created: ' + authMessage(r.json));
    created = true;
  }
  await c.sql.begin(async (tx) => {
    await audit(tx, c.user.id, created ? 'CREATE_LOGIN' : 'SET_PASSWORD', 'auth.users', known.user_id ?? null, null,
      { role: known.accounts ? 'ACCOUNTS' : 'STAFF_ROW' });
  });
  clearAccessCache();
  return { email, created };
}
