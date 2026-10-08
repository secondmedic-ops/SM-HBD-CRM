// SM HBD CRM on Cloudflare (Workers FREE plan) - the whole app in one Worker:
//   /api/*       the backend (TypeScript, src/api + src/services + src/domain) on Supabase Postgres
//   everything   the React build (../dist) as static assets
// Deployed ONLY by the pipeline (.github/workflows/ship.yml, step 5). Workers Builds must stay disconnected.
import { accessOf, authOff, User, verifyToken } from './api/auth';
import type { Ctx } from './api/context';
import { errorResponse, json, noContent, readJson, toResponse } from './api/http';
import { contract, match } from './api/routes';
import { connect, schemaProblems, Sql } from './db';
import { Env } from './env';
import { reportIssue } from './systemTracker';

export type { Env };

const UNAUTHORIZED = 'Please log in again (missing or expired session).';
const FORBIDDEN = 'Your role does not allow this action. Ask an admin.';
const unauthorized = () => json({ status: 401, error: 'Unauthorized', message: UNAUTHORIZED }, 401);

async function databaseUp(env: Env, ctx: ExecutionContext): Promise<boolean> {
  let sql: Sql | null = null;
  try {
    sql = connect(env);
    await Promise.race([sql`select 1`, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 5000))]);
    return true;
  } catch (e) {
    console.error('Health: database check failed', (e as Error).message);
    return false;
  } finally {
    if (sql) ctx.waitUntil(sql.end({ timeout: 2 }).catch(() => {}));
  }
}

async function api(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return noContent();
  const path = url.pathname;

  // Rehearsal-only helpers (EXPOSE_CONTRACT=1 is set by scripts/rehearse.mjs, never in production).
  if (env.EXPOSE_CONTRACT === '1' && req.method === 'GET') {
    if (path === '/api/_contract') return json(contract());
    if (path === '/api/_schema-check') {
      const sql = connect(env);
      try { return json({ problems: await schemaProblems(sql) }); } finally { ctx.waitUntil(sql.end({ timeout: 2 })); }
    }
  }

  const found = match(req.method, path);
  if (typeof found !== 'number' && found.route.access === 'public') {
    switch (found.route.path) {
      case '/api/version':
        return new Response(env.BUILD_SHA || 'dev', { headers: { 'Content-Type': 'text/plain' } });
      case '/api/actuator/health/liveness':
        return json({ status: 'UP' });
      case '/api/actuator/health': {
        const up = await databaseUp(env, ctx);
        return json({ status: up ? 'UP' : 'DOWN', components: { db: { status: up ? 'UP' : 'DOWN' } } }, up ? 200 : 503);
      }
      default: // /api/v1/health
        return json({ status: 'UP', service: 'sm-hbd-crm', database: (await databaseUp(env, ctx)) ? 'UP' : 'DOWN', timestamp: new Date().toISOString() });
    }
  }

  // Everything else needs a login - also unknown paths, so the API reveals nothing without a token.
  const off = authOff(env);
  const who = off ? { id: 'local-dev', email: null } : await verifyToken(req, env);
  if (!who) return unauthorized();
  if (found === 404) return errorResponse(404, `No endpoint ${req.method} ${path}`);
  if (found === 405) return errorResponse(405, `${req.method} is not allowed on ${path}`);

  const sql = connect(env);
  try {
    const user: User = off
      ? { id: 'local-dev', email: null, role: 'ADMIN', staffId: null, staffName: null, dept: null, inchargeId: null, teamIds: [], authMode: 'off' }
      : { ...who, ...(await accessOf(sql, who.id, who.email)), authMode: 'supabase' };
    const { route, params } = found;
    if (route.path === '/api/v1/me') {
      return json({ userId: user.id, email: user.email, role: user.role, authMode: user.authMode,
        staffId: user.staffId, staffName: user.staffName, dept: user.dept, inchargeId: user.inchargeId });
    }
    if (route.access !== 'login' && (!user.role || !(route.access as readonly string[]).includes(user.role))) {
      return errorResponse(403, FORBIDDEN);
    }
    const c: Ctx = { sql, env, user, url, params, req };
    const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : undefined;
    const result = await route.handler!(c, body);
    if (route.status === 204) return noContent();
    return json(result, route.status ?? 200);
  } catch (e) {
    const res = toResponse(e);
    if (res.status >= 500) {
      const msg = String((e as Error)?.message ?? e);
      ctx.waitUntil(reportIssue(env, { component: 'api', title: msg.slice(0, 120) || 'Unhandled API error', errorMessage: msg }));
    }
    return res;
  } finally {
    ctx.waitUntil(sql.end({ timeout: 2 }).catch(() => {}));
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, ctx);
      } catch (e) {
        const res = toResponse(e);
        if (res.status >= 500) {
          const msg = String((e as Error)?.message ?? e);
          ctx.waitUntil(reportIssue(env, { component: 'api', title: msg.slice(0, 120) || 'Unhandled API error', errorMessage: msg }));
        }
        return res;
      }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
