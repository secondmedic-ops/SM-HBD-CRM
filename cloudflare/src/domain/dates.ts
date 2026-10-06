// Dates are ISO strings "YYYY-MM-DD" (Postgres date, JSON LocalDate). Arithmetic in UTC so it never shifts a day.

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function parts(date: string): [number, number, number] {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addMonths(date: string, months: number): string {
  const [y, m] = parts(date);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
}

export const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

/** Today at the store (Asia/Kolkata). The Worker runs in UTC; new Date() alone is yesterday until 05:30 IST. */
export function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A Postgres date column value (Date object at UTC midnight or string) as "YYYY-MM-DD". */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  return String(v).slice(0, 10);
}
