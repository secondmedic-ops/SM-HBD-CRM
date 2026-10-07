// Every business call needs a Supabase access token (Authorization: Bearer ...), verified here with the project's
// ES256 signing keys (JWKS), issuer <SUPABASE_URL>/auth/v1 and audience "authenticated". The role never comes from
// user_metadata (users can edit that); it is worked out from the database, cached for 60 seconds per Worker instance:
//   1. public.user_roles row for the login (ADMIN, or any role set by hand)       -> that role
//   2. the login's email is in Staff mapping > Accounts team logins             -> ACCOUNTS
//   3. the login's email is on an active staff row (Staff mapping)              -> INCHARGE (Incharge) or STAFF (Team)
// An INCHARGE works with their team: everyone who reports to them, directly or through an incharge who reports to them
// (staff.incharge_id, followed down the chain), and themselves.
// A login with none of these has no role and sees nothing but /api/v1/me.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Db } from '../db';
import { databaseUrl, isLocalDb } from '../db';
import type { Env } from '../env';

export const ROLES = ['ADMIN', 'ACCOUNTS', 'INCHARGE', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export interface Access {
  role: Role | null;
  /** The staff row linked to this login by email (null for admins / accounts without one). */
  staffId: string | null;
  staffName: string | null;
  /** Department of that staff row. */
  dept: string | null;
  /** The incharge that staff row reports to (a team member sees their team's daily updates). */
  inchargeId: string | null;
  /** INCHARGE: ids of their whole team (themselves + everyone below them in the reporting chain). Others: empty. */
  teamIds: string[];
}

export interface User extends Access {
  id: string;
  email: string | null;
  authMode: 'supabase' | 'off';
}

const jwksBySupabase = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const accessCache = new Map<string, Access & { at: number }>();
const CACHE_MS = 60_000;

export const supabaseBase = (env: Env) => (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');

/** True when this Worker may run without login: AUTH_MODE=off AND the database is on this computer. */
export function authOff(env: Env): boolean {
  if ((env.AUTH_MODE || '').toLowerCase() !== 'off') return false;
  const url = databaseUrl(env);
  if (!url || !isLocalDb(url)) {
    throw new Error('AUTH_MODE=off is for the local test database only and is refused for any other database.');
  }
  return true;
}

/** The verified user id and email from the token, or null when there is no valid token. */
export async function verifyToken(req: Request, env: Env): Promise<{ id: string; email: string | null } | null> {
  const header = req.headers.get('Authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const base = supabaseBase(env);
  if (!base) throw new Error('SUPABASE_URL is not set - no login can be verified.');
  let jwks = jwksBySupabase.get(base);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(base + '/auth/v1/.well-known/jwks.json'), { cacheMaxAge: 10 * 60_000 });
    jwksBySupabase.set(base, jwks);
  }
  try {
    const { payload } = await jwtVerify(m[1].trim(), jwks, {
      algorithms: ['ES256'],
      issuer: base + '/auth/v1',
      audience: 'authenticated',
    });
    if (!payload.sub) return null;
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  } catch (e) {
    console.warn('Login token refused:', (e as Error)?.name, (e as Error)?.message);
    return null;
  }
}

/** Role and staff link of a login (one query), cached for 60 seconds. */
export async function accessOf(db: Db, userId: string, email: string | null): Promise<Access> {
  const now = Date.now();
  const c = accessCache.get(userId);
  if (c && now - c.at < CACHE_MS) return c;
  if (!/^[0-9a-fA-F-]{36}$/.test(userId)) return { role: null, staffId: null, staffName: null, dept: null, inchargeId: null, teamIds: [] };
  const mail = (email || '').trim().toLowerCase();
  const [row] = await db`
    select (select r.role from public.user_roles r where r.user_id = ${userId}::uuid) as role,
           exists (select 1 from public.accounts_logins a where a.email = ${mail}) as accounts,
           s.id::text as staff_id, s.name as staff_name, s.dept, s.role as staff_role, s.incharge_id::text as incharge_id
    from (select 1) one
    left join public.staff s on ${mail} <> '' and lower(s.email) = ${mail} and s.active`;
  const set = row?.role && (ROLES as readonly string[]).includes(String(row.role)) ? (String(row.role) as Role) : null;
  const role: Role | null = set ?? (row?.accounts ? 'ACCOUNTS' : row?.staff_id ? (row.staff_role === 'Incharge' ? 'INCHARGE' : 'STAFF') : null);
  // The reporting chain below an incharge (cycles are refused when saving, and `union` stops one anyway).
  let teamIds: string[] = [];
  if (role === 'INCHARGE' && row?.staff_id) {
    const t = await db`with recursive t(id) as (select ${row.staff_id}::uuid
                         union select s.id from public.staff s join t on s.incharge_id = t.id where s.active)
                       select id::text from t`;
    teamIds = t.map((x) => String(x.id));
  }
  const hit = {
    role,
    staffId: row?.staff_id ?? null,
    staffName: row?.staff_name ?? null,
    dept: row?.dept ?? null,
    inchargeId: row?.incharge_id ?? null,
    teamIds,
    at: now,
  };
  accessCache.set(userId, hit);
  return hit;
}

/** Forget cached access right away (after an admin changes staff emails, roles or accounts logins). */
export const clearAccessCache = () => accessCache.clear();
