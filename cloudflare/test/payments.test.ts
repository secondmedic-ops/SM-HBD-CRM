// Payment rules of revenue entries and outstanding rows (src/domain/payments.ts).
import Big from 'big.js';
import { describe, expect, it } from 'vitest';
import { outstandingFor, receive, receivedFor, statusOf } from '../src/domain/payments';

const b = (v: string | number) => new Big(v);
const s = (x: { amount: Big; paid: Big } | null) => (x ? { amount: x.amount.toFixed(2), paid: x.paid.toFixed(2) } : null);

describe('status and received', () => {
  it('status follows the numbers', () => {
    expect(statusOf(b(1000), b(1000))).toBe('Paid');
    expect(statusOf(b(1000), b(1))).toBe('Partly paid');
    expect(statusOf(b(1000), b(0))).toBe('Outstanding');
  });
  it('Paid = all, Outstanding = nothing, Partly paid = typed', () => {
    expect(receivedFor('Paid', b(500), null).toFixed(2)).toBe('500.00');
    expect(receivedFor('Outstanding', b(500), b(200)).toFixed(2)).toBe('0.00');
    expect(receivedFor('Partly paid', b(500), b('199.99')).toFixed(2)).toBe('199.99');
  });
  it('Partly paid needs more than 0 and less than the amount', () => {
    expect(() => receivedFor('Partly paid', b(500), null)).toThrow(/more than 0 and less/);
    expect(() => receivedFor('Partly paid', b(500), b(0))).toThrow();
    expect(() => receivedFor('Partly paid', b(500), b(500))).toThrow();
  });
});

describe('outstanding row of an entry', () => {
  it('new entry: rest of the amount, or none when paid', () => {
    expect(s(outstandingFor(b(1000), b(400), null))).toEqual({ amount: '600.00', paid: '0.00' });
    expect(outstandingFor(b(1000), b(1000), null)).toBeNull();
  });
  it('edit keeps payments already collected', () => {
    // 1000 entered with 400 up front -> outstanding 600; 250 collected later -> received 650.
    const prev = { amount: b(600), paid: b(250) };
    // Amount corrected to 1200, received still 650: up front 400 -> outstanding 800, paid 250.
    expect(s(outstandingFor(b(1200), b(650), prev))).toEqual({ amount: '800.00', paid: '250.00' });
    // Marked Paid: outstanding shrinks to what was paid on it, so it shows as Paid.
    expect(s(outstandingFor(b(1000), b(1000), prev))).toEqual({ amount: '250.00', paid: '250.00' });
  });
  it('received below what was collected on the outstanding is refused', () => {
    expect(() => outstandingFor(b(1000), b(100), { amount: b(600), paid: b(250) })).toThrow(/already collected/);
  });
  it('received above the amount is refused', () => {
    expect(() => outstandingFor(b(100), b(101), null)).toThrow();
  });
});

describe('payments on an outstanding row', () => {
  it('adds up to the amount, never beyond', () => {
    expect(receive({ amount: b(600), paid: b(0) }, b('250.50')).toFixed(2)).toBe('250.50');
    expect(receive({ amount: b(600), paid: b('250.50') }, b('349.50')).toFixed(2)).toBe('600.00');
    expect(() => receive({ amount: b(600), paid: b(500) }, b('100.01'))).toThrow(/Only Rs 100.00/);
    expect(() => receive({ amount: b(600), paid: b(0) }, b(0))).toThrow();
  });
});
