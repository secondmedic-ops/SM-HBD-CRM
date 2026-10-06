// Request body checks. Wrong JSON types or
// unknown enum values are "Malformed JSON request"; rule breaks collect into fieldErrors.
import Big from 'big.js';
import { isIsoDate } from '../domain/dates';
import { ApiError } from '../domain/errors';

const malformed = () => new ApiError(400, 'Malformed JSON request');

export class Check {
  readonly errors: Record<string, string> = {};
  private add(field: string, message: string) {
    if (!(field in this.errors)) this.errors[field] = message;
  }
  notBlank(field: string, v: string | null) { if (v === null || !v.trim()) this.add(field, 'must not be blank'); }
  notNull(field: string, v: unknown) { if (v === null || v === undefined) this.add(field, 'must not be null'); }
  notEmpty(field: string, v: unknown[] | null) { if (!v || v.length === 0) this.add(field, 'must not be empty'); }
  min(field: string, v: number | null, min: number) { if (v !== null && v < min) this.add(field, `must be greater than or equal to ${min}`); }
  /** A rule of the caller's own (same 400 shape as the built-in checks). */
  fail(field: string, message: string) { this.add(field, message); }
  max(field: string, v: number | null, max: number) { if (v !== null && v > max) this.add(field, `must be less than or equal to ${max}`); }
  decMin(field: string, v: Big | null, min: string) { if (v !== null && v.lt(min)) this.add(field, `must be greater than or equal to ${min}`); }
  decMax(field: string, v: Big | null, max: string) { if (v !== null && v.gt(max)) this.add(field, `must be less than or equal to ${max}`); }
  maxLen(field: string, v: string | null, max: number) { if (v !== null && v.length > max) this.add(field, `size must be between 0 and ${max}`); }
  pattern(field: string, v: string | null, re: RegExp, message: string) { if (v !== null && !re.test(v)) this.add(field, message); }
  done() {
    if (Object.keys(this.errors).length) throw new ApiError(400, 'Validation failed', this.errors);
  }
}

export function obj(v: unknown): Record<string, any> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw malformed();
  return v as Record<string, any>;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw malformed();
}

export function int(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw malformed();
  return n;
}

export function decimal(v: unknown): Big | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' && typeof v !== 'string') throw malformed();
  try {
    return new Big(typeof v === 'number' ? String(v) : v.trim());
  } catch {
    throw malformed();
  }
}

export function bool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'false') return v === 'true';
  throw malformed();
}

export function date(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (!isIsoDate(v)) throw malformed();
  return v;
}

export function oneOf<T extends string>(v: unknown, values: readonly T[]): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !values.includes(v as T)) throw malformed();
  return v as T;
}

export function arr(v: unknown): unknown[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) throw malformed();
  return v;
}

/** A date in the query string (?upto=2026-09-28); 400 when it isn't one. */
export function queryDate(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  if (v === null || v === '') return null;
  if (!isIsoDate(v)) throw new ApiError(400, `${name} must be a date like 2026-09-28`);
  return v;
}

export const hasText = (s: string | null | undefined): s is string => !!s && !!s.trim();

/** A uuid path parameter; 404 for anything else (no database error for a typo in the URL). */
export function uuidParam(v: string | undefined, what: string): string {
  if (!v || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)) {
    throw new ApiError(404, `${what} not found: ${v ?? ''}`);
  }
  return v.toLowerCase();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
