// THE list of API endpoints: path, method, who may call it, and the handler. The router, the security rules and the
// API contract (docs/openapi.json, checked against src/api.ts in the pipeline) all come from this one table, so an
// endpoint cannot exist without a role rule. "public" = no login; "login" = any logged-in user, even without a role.
// What a role sees inside an endpoint (own rows / own department / everything) is decided in services/scope.ts.
import type { Role } from './auth';
import type { Ctx } from './context';
import { getAttachment } from '../services/attachments';
import { createClient, createVisit, deleteClient, deleteVisit, listClients, listVisits, updateClient, updateVisit } from '../services/clients';
import { addAccountsLogin, listAccountsLogins, removeAccountsLogin, setLogin } from '../services/logins';
import { createOutstanding, createRevenue, deleteRevenue, listOutstanding, listRevenue, receiveOutstanding, updateRevenue } from '../services/revenue';
import { createStaff, deleteStaff, listDepartments, listStaff, setDepartmentTarget, updateStaff } from '../services/staff';
import { createUpdate, listUpdates } from '../services/updates';

export type Access = 'public' | 'login' | readonly Role[];
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface Route {
  method: Method;
  path: string;
  access: Access;
  summary: string;
  /** Status for a successful answer: 200 (default), 201 created, 204 no body. */
  status?: 200 | 201 | 204;
  /** Built-in endpoints (health, version, me) are answered in index.ts. */
  handler?: (c: Ctx, body: unknown) => Promise<unknown> | unknown;
}

const ALL: readonly Role[] = ['ADMIN', 'ACCOUNTS', 'INCHARGE', 'STAFF'];
const ADMIN: readonly Role[] = ['ADMIN'];

export const ROUTES: Route[] = [
  { method: 'GET', path: '/api/v1/health', access: 'public', summary: 'Health and database status' },
  { method: 'GET', path: '/api/version', access: 'public', summary: 'Commit that is live' },
  { method: 'GET', path: '/api/actuator/health', access: 'public', summary: 'Health with database check' },
  { method: 'GET', path: '/api/actuator/health/liveness', access: 'public', summary: 'Liveness' },
  { method: 'GET', path: '/api/v1/me', access: 'login', summary: 'The logged-in user: email, role, linked staff member and department' },

  { method: 'GET', path: '/api/v1/departments', access: ALL, summary: 'Departments with monthly targets', handler: listDepartments },
  { method: 'PUT', path: '/api/v1/departments/{name}', access: ADMIN, summary: 'Set a department target ({target})', handler: setDepartmentTarget },

  { method: 'GET', path: '/api/v1/staff', access: ALL, summary: 'Active staff (email and login status only for ADMIN)', handler: listStaff },
  { method: 'POST', path: '/api/v1/staff', access: ADMIN, status: 201, summary: 'Add a staff member', handler: createStaff },
  { method: 'PUT', path: '/api/v1/staff/{id}', access: ADMIN, summary: 'Change a staff member (only the fields sent)', handler: updateStaff },
  { method: 'DELETE', path: '/api/v1/staff/{id}', access: ADMIN, status: 204, summary: 'Remove a staff member (past entries stay)', handler: deleteStaff },

  { method: 'GET', path: '/api/v1/revenue', access: ALL, summary: 'Revenue entries in scope (?from&to); no cost for STAFF', handler: listRevenue },
  { method: 'POST', path: '/api/v1/revenue', access: ALL, status: 201, summary: 'New revenue entry (+ outstanding row when not fully paid)', handler: createRevenue },
  { method: 'PUT', path: '/api/v1/revenue/{id}', access: ALL, summary: 'Change a revenue entry (its outstanding row follows)', handler: updateRevenue },
  { method: 'DELETE', path: '/api/v1/revenue/{id}', access: ['ADMIN', 'ACCOUNTS', 'INCHARGE'], status: 204, summary: 'Delete a revenue entry and its outstanding row', handler: deleteRevenue },

  { method: 'GET', path: '/api/v1/outstanding', access: ALL, summary: 'Outstanding payments in scope', handler: listOutstanding },
  { method: 'POST', path: '/api/v1/outstanding', access: ALL, status: 201, summary: 'Add an outstanding payment without a revenue entry', handler: createOutstanding },
  { method: 'POST', path: '/api/v1/outstanding/{id}/receive', access: ALL, summary: 'Record a payment received ({amount})', handler: receiveOutstanding },

  { method: 'GET', path: '/api/v1/daily-updates', access: ALL, summary: 'Daily updates (own department for INCHARGE / STAFF; ?from&to)', handler: listUpdates },
  { method: 'POST', path: '/api/v1/daily-updates', access: ALL, status: 201, summary: 'Post a daily update', handler: createUpdate },

  // Clients: STAFF their own, INCHARGE the department, ADMIN / ACCOUNTS all (services/clients.ts).
  { method: 'GET', path: '/api/v1/clients', access: ALL, summary: 'Clients in scope (?q&status) with visit count, last visit, next follow-up', handler: listClients },
  { method: 'POST', path: '/api/v1/clients', access: ALL, status: 201, summary: 'Add a client (owner: the caller, or staffId for incharge / admin)', handler: createClient },
  { method: 'PUT', path: '/api/v1/clients/{id}', access: ALL, summary: 'Change a client (only the fields sent; staffId hands it over)', handler: updateClient },
  { method: 'DELETE', path: '/api/v1/clients/{id}', access: ALL, status: 204, summary: 'Delete a client without revenue entries (visits go with it)', handler: deleteClient },
  { method: 'GET', path: '/api/v1/visits', access: ALL, summary: 'Visits of clients in scope (?clientId&from&to)', handler: listVisits },
  { method: 'POST', path: '/api/v1/visits', access: ALL, status: 201, summary: 'Log a visit / call / meeting with a client', handler: createVisit },
  { method: 'PUT', path: '/api/v1/visits/{id}', access: ALL, summary: 'Change a visit', handler: updateVisit },
  { method: 'DELETE', path: '/api/v1/visits/{id}', access: ALL, status: 204, summary: 'Delete a visit', handler: deleteVisit },

  { method: 'GET', path: '/api/v1/attachments/{id}', access: ALL, summary: 'A slip / screenshot image of an entry the caller may see', handler: getAttachment },

  { method: 'GET', path: '/api/v1/admin/accounts-logins', access: ADMIN, summary: 'Accounts team emails', handler: listAccountsLogins },
  { method: 'POST', path: '/api/v1/admin/accounts-logins', access: ADMIN, status: 201, summary: 'Add an accounts team email', handler: addAccountsLogin },
  { method: 'DELETE', path: '/api/v1/admin/accounts-logins/{email}', access: ADMIN, status: 204, summary: 'Remove an accounts team email', handler: removeAccountsLogin },
  { method: 'POST', path: '/api/v1/admin/logins', access: ADMIN, summary: 'Create a login or set its password ({email, password})', handler: setLogin },
];

const compiled = ROUTES.map((r) => {
  const names: string[] = [];
  const re = new RegExp('^' + r.path.replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
  return { route: r, re, names };
});

/** The route for a request, or why there is none: 404 (unknown path) / 405 (path exists, other method). */
export function match(method: string, pathname: string): { route: Route; params: Record<string, string> } | 404 | 405 {
  let pathFound = false;
  for (const { route, re, names } of compiled) {
    const m = pathname.match(re);
    if (!m) continue;
    pathFound = true;
    if (route.method !== method) continue;
    const params: Record<string, string> = {};
    names.forEach((n, i) => { try { params[n] = decodeURIComponent(m[i + 1]); } catch { params[n] = m[i + 1]; } });
    return { route, params };
  }
  return pathFound ? 405 : 404;
}

/** OpenAPI-style contract (paths, methods, roles) -> docs/openapi.json. */
export function contract() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    paths[r.path] ??= {};
    paths[r.path][r.method.toLowerCase()] = {
      summary: r.summary,
      'x-access': r.access === 'public' || r.access === 'login' ? r.access : [...r.access],
      responses: { [String(r.status ?? 200)]: { description: 'OK' } },
    };
  }
  return { openapi: '3.0.3', info: { title: 'SM HBD CRM API (Cloudflare Worker)', version: '1' }, paths };
}
