// Supabase Postgres through postgres.js over Cloudflare Hyperdrive (pooled, TLS to Supabase handled by Hyperdrive).
// One short-lived connection per request, closed after the response.
// numeric comes back as a string (exact money -> big.js), date as "YYYY-MM-DD", timestamptz as Date.
import postgres from 'postgres';
import { ApiError } from './domain/errors';
import type { Env } from './env';

export type Sql = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;
/** Either a plain connection or a transaction - services take this so they work in both. */
export type Db = Sql | Tx;

export const isLocalDb = (url: string) => {
  try {
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** The connection string this Worker uses: Hyperdrive in production, DATABASE_URL only for a local database. */
export function databaseUrl(env: Env): string | undefined {
  if (env.DATABASE_URL && isLocalDb(env.DATABASE_URL)) return env.DATABASE_URL;
  return env.HYPERDRIVE?.connectionString;
}

export function connect(env: Env): Sql {
  const url = databaseUrl(env);
  if (!url) throw new ApiError(503, 'Database is not configured (Hyperdrive binding missing). Run SHIP.bat again.');
  // Hyperdrive (and a local database) take plain connections; Hyperdrive itself talks TLS to Supabase.
  return postgres(url, {
    prepare: false,
    max: 1,
    fetch_types: false,
    idle_timeout: 5,
    connect_timeout: 10,
    ssl: false,
    types: {
      // date (1082): keep the text, never shift a day through a JS Date.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
    onnotice: () => {},
  });
}

/**
 * Every table and column the Worker reads or writes. The rehearsal (and the live smoke test) selects them all from
 * the database built from supabase/migrations, so code that uses a column the migrations don't have fails the
 * pipeline before deploy.
 */
export const SCHEMA: Record<string, string[]> = {
  departments: ['name', 'target', 'sort_order', 'updated_at'],
  staff: ['id', 'name', 'dept', 'role', 'designation', 'project', 'individual_target', 'email', 'active', 'incharge_id', 'created_at', 'updated_at'],
  attachments: ['id', 'mime', 'data', 'bytes', 'created_by', 'created_at'],
  revenue_entries: ['id', 'entry_date', 'staff_id', 'dept', 'client', 'type', 'amount', 'cost', 'is_new_client', 'amount_received',
    'due_date', 'slip_id', 'client_id', 'created_by', 'created_at', 'updated_at'],
  clients: ['id', 'name', 'type', 'category', 'contact_person', 'phone', 'email', 'address', 'city', 'pincode', 'status', 'notes',
    'staff_id', 'dept', 'created_by', 'created_at', 'updated_at'],
  client_visits: ['id', 'client_id', 'staff_id', 'visit_date', 'kind', 'purpose', 'notes', 'next_follow_up', 'created_by',
    'created_at', 'updated_at'],
  outstanding_payments: ['id', 'revenue_entry_id', 'client', 'staff_id', 'dept', 'amount', 'amount_paid', 'due_date', 'screenshot_id',
    'created_by', 'created_at', 'updated_at'],
  daily_updates: ['id', 'update_date', 'staff_id', 'dept', 'update_text', 'clients_met', 'created_by', 'created_at'],
  accounts_logins: ['email', 'added_by', 'created_at'],
  user_roles: ['user_id', 'role', 'created_at'],
  audit_log: ['id', 'at', 'user_id', 'action', 'table_name', 'row_id', 'before', 'after'],
};

/** Returns the problems ("table.column missing"), empty when the database matches SCHEMA. */
export async function schemaProblems(sql: Sql): Promise<string[]> {
  const rows = await sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`;
  const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const problems: string[] = [];
  for (const [t, cols] of Object.entries(SCHEMA)) for (const c of cols) if (!have.has(`${t}.${c}`)) problems.push(`${t}.${c} is missing`);
  return problems;
}
