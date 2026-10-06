/**
 * SM HBD CRM - client for the API (the Cloudflare Worker in cloudflare/, same address as the site).
 *
 * EVERY call to the backend goes through request() below: it attaches the Supabase login token.
 * The pipeline (scripts/check-api.mjs) fails the deploy if a path used here does not exist in the Worker,
 * and the Worker answers 401 to any call without a valid token.
 *
 * Locally (npm run dev / RUN-LOCAL-TEST.bat) server.ts forwards /api/v1 to the Worker on :8787.
 */
import { accessToken, supabase } from './lib/supabase';
import type { Client, ClientVisit, DailyUpdate, Department, OutstandingPayment, RevenueEntry, Staff } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && supabase) {
    // Session expired or revoked: back to the login screen (AuthGate listens for this).
    await supabase.auth.signOut();
  }
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, `Unexpected response from ${path}`);
    }
  }
  if (!res.ok) {
    const fields = body?.fieldErrors
      ? ': ' + Object.entries(body.fieldErrors).map(([k, v]) => `${k} ${v}`).join('; ')
      : '';
    throw new ApiError(res.status, (body?.message || body?.error || `Request failed (${res.status})`) + fields);
  }
  return body as T;
}

const json = (b: unknown) => JSON.stringify(b);

/** The logged-in user. role is null until the admin links the email in Staff mapping. */
export interface ApiMe {
  userId: string | null;
  email: string | null;
  role: 'ADMIN' | 'ACCOUNTS' | 'INCHARGE' | 'STAFF' | null;
  authMode: 'supabase' | 'off';
  /** Staff row linked to this login by email, and its department. */
  staffId?: string;
  staffName?: string;
  dept?: string;
}

export interface RevenueInput {
  date: string;
  staffId: string;
  client: string;
  type: RevenueEntry['type'];
  amount: number;
  /** Left out by team members (they never see cost). */
  cost?: number;
  isNewClient: boolean;
  paymentStatus: RevenueEntry['paymentStatus'];
  amountReceived?: number;
  dueDate?: string;
  /** A new slip image (data URL, shrunk by src/lib/image.ts); leave out to keep the saved one. */
  slipImage?: string;
  removeSlip?: boolean;
  /** A client from the Clients list (the API then uses that client's name). */
  clientId?: string;
}

export interface ClientInput {
  name?: string;
  type?: Client['type'];
  category?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  pincode?: string;
  status?: Client['status'];
  notes?: string;
  /** Owner (incharge / admin only; a team member's clients are always their own). */
  staffId?: string;
}

export interface VisitInput {
  clientId?: string;
  date: string;
  kind: ClientVisit['kind'];
  purpose: string;
  notes: string;
  nextFollowUp?: string;
  /** Admin / accounts: who made the visit (default: the client's owner). */
  staffId?: string;
}

export interface OutstandingInput {
  client: string;
  staffId: string;
  amount: number;
  dueDate: string;
  screenshot?: string;
}

export interface StaffInput {
  name?: string;
  dept?: string;
  role?: Staff['role'];
  designation?: string;
  project?: string;
  individualTarget?: number;
  /** Work email of the person's login ('' removes the link). */
  email?: string;
}

export interface AccountsLogin {
  email: string;
  hasLogin: boolean;
  createdAt?: string;
}

export const api = {
  me: () => request<ApiMe>('/api/v1/me'),

  departments: () => request<Department[]>('/api/v1/departments'),
  setDepartmentTarget: (name: string, target: number) =>
    request<Department>(`/api/v1/departments/${encodeURIComponent(name)}`, { method: 'PUT', body: json({ target }) }),

  staff: () => request<Staff[]>('/api/v1/staff'),
  addStaff: (s: StaffInput) => request<Staff>('/api/v1/staff', { method: 'POST', body: json(s) }),
  updateStaff: (id: string, s: StaffInput) => request<Staff>(`/api/v1/staff/${id}`, { method: 'PUT', body: json(s) }),
  deleteStaff: (id: string) => request<null>(`/api/v1/staff/${id}`, { method: 'DELETE' }),

  revenue: () => request<RevenueEntry[]>('/api/v1/revenue'),
  addRevenue: (r: RevenueInput) => request<RevenueEntry>('/api/v1/revenue', { method: 'POST', body: json(r) }),
  updateRevenue: (id: string, r: RevenueInput) => request<RevenueEntry>(`/api/v1/revenue/${id}`, { method: 'PUT', body: json(r) }),
  deleteRevenue: (id: string) => request<null>(`/api/v1/revenue/${id}`, { method: 'DELETE' }),

  outstanding: () => request<OutstandingPayment[]>('/api/v1/outstanding'),
  addOutstanding: (o: OutstandingInput) => request<OutstandingPayment>('/api/v1/outstanding', { method: 'POST', body: json(o) }),
  receiveOutstanding: (id: string, amount: number) =>
    request<OutstandingPayment>(`/api/v1/outstanding/${id}/receive`, { method: 'POST', body: json({ amount }) }),

  dailyUpdates: () => request<DailyUpdate[]>('/api/v1/daily-updates'),
  addDailyUpdate: (u: { date: string; staffId?: string; updateText: string; clientMetCount: number }) =>
    request<DailyUpdate>('/api/v1/daily-updates', { method: 'POST', body: json(u) }),

  clients: () => request<Client[]>('/api/v1/clients'),
  addClient: (c: ClientInput) => request<Client>('/api/v1/clients', { method: 'POST', body: json(c) }),
  updateClient: (id: string, c: ClientInput) => request<Client>(`/api/v1/clients/${id}`, { method: 'PUT', body: json(c) }),
  deleteClient: (id: string) => request<null>(`/api/v1/clients/${id}`, { method: 'DELETE' }),
  visits: () => request<ClientVisit[]>('/api/v1/visits'),
  addVisit: (v: VisitInput) => request<ClientVisit>('/api/v1/visits', { method: 'POST', body: json(v) }),
  updateVisit: (id: string, v: VisitInput) => request<ClientVisit>(`/api/v1/visits/${id}`, { method: 'PUT', body: json(v) }),
  deleteVisit: (id: string) => request<null>(`/api/v1/visits/${id}`, { method: 'DELETE' }),

  /** A slip / screenshot image as a data URL (only for entries the user may see). */
  attachment: (id: string) => request<{ id: string; dataUrl: string }>(`/api/v1/attachments/${id}`),

  accountsLogins: () => request<AccountsLogin[]>('/api/v1/admin/accounts-logins'),
  addAccountsLogin: (email: string) => request<AccountsLogin>('/api/v1/admin/accounts-logins', { method: 'POST', body: json({ email }) }),
  removeAccountsLogin: (email: string) =>
    request<null>(`/api/v1/admin/accounts-logins/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  /** Creates the login for a staff / accounts email, or sets a new password when it exists. */
  setLogin: (email: string, password: string) =>
    request<{ email: string; created: boolean }>('/api/v1/admin/logins', { method: 'POST', body: json({ email, password }) }),
};
