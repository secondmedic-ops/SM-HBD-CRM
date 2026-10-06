// Exact decimal money, rounding half up. Never use JS floating point for money.
import Big from 'big.js';

Big.DP = 10;
Big.RM = Big.roundHalfUp;

export type Dec = Big;
export const ZERO = new Big(0);
export const HUNDRED = new Big(100);

/** Accepts numbers, numeric strings (Postgres numeric) and Big; null/undefined/'' become null. */
export function dec(v: Big.BigSource | null | undefined): Big | null {
  if (v === null || v === undefined || v === '') return null;
  return v instanceof Big ? v : new Big(typeof v === 'number' ? String(v) : v);
}
/** Like dec() but null becomes 0. */
export const d0 = (v: Big.BigSource | null | undefined): Big => dec(v) ?? ZERO;

/** Rounds to 2 decimals, half up . */
export const money = (v: Big): Big => v.round(2, Big.roundHalfUp);

/** a / b rounded half up to `dp` decimals in one step. */
export function div(a: Big, b: Big | number, dp = 10): Big {
  const prev = Big.DP;
  Big.DP = dp;
  try {
    return a.div(b);
  } finally {
    Big.DP = prev;
  }
}

/** Number for JSON output (money is exact to 2 decimals, so this is lossless). */
export const num = (v: Big | null | undefined): number | null => (v === null || v === undefined ? null : Number(v.toString()));

/** 5.00 -> "5", 0.25 -> "0.25". */
export const plain = (v: Big): string => v.toFixed(Math.max(0, v.c.length - v.e - 1)).replace(/^-0$/, '0');

export const sign = (v: Big): number => (v.eq(0) ? 0 : v.gt(0) ? 1 : -1);
