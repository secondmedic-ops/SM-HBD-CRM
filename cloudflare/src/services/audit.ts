// public.audit_log: who (Supabase user id) did what to which row, with the row before and after. Written inside
// the caller's transaction, so a change and its audit row are saved together or not at all.
// Personal data stays out on purpose (DPDP Act): never pass customer / patient / doctor names, phones,
// addresses or ledger "details".
import Big from 'big.js';
import type { Db } from '../db';

type Snapshot = Record<string, unknown> | null;

const plainJson = (v: Snapshot) =>
  v === null ? null : JSON.stringify(v, (_k, x) => (x instanceof Big ? Number(x.toString()) : x));

export async function audit(db: Db, userId: string | null, action: string, table: string, rowId: string | null,
  before: Snapshot, after: Snapshot): Promise<void> {
  const uid = userId && /^[0-9a-fA-F-]{36}$/.test(userId) ? userId : null;
  await db`insert into public.audit_log (user_id, action, table_name, row_id, before, after)
           values (${uid}::uuid, ${action}, ${table}, ${rowId}, ${plainJson(before)}::text::jsonb, ${plainJson(after)}::text::jsonb)`;
}

/** Many audit rows in one statement (bulk operations such as a ledger import). */
export async function auditMany(db: Db, userId: string | null, action: string, table: string,
  rows: { rowId: string; before: Snapshot; after: Snapshot }[]): Promise<void> {
  if (!rows.length) return;
  const uid = userId && /^[0-9a-fA-F-]{36}$/.test(userId) ? userId : null;
  await db`insert into public.audit_log (user_id, action, table_name, row_id, before, after)
           select ${uid}::uuid, ${action}, ${table}, r.row_id, r.b::jsonb, r.a::jsonb
           from json_to_recordset(${JSON.stringify(rows.map((r) => ({ row_id: r.rowId, b: plainJson(r.before), a: plainJson(r.after) })))}::text::json)
             as r(row_id text, b text, a text)`;
}
