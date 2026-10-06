// Payment rules of a revenue entry and its outstanding row. Pure functions on exact decimals (big.js), unit-tested in
// test/payments.test.ts.
//
// A revenue entry has an amount A and a total received R (0 <= R <= A). When it is not fully paid at entry time, an
// outstanding row is made for the rest: outstanding amount O = A - (received up front), paid P = 0. Every payment
// recorded on the outstanding row raises P and R by the same sum, so at all times R = upfront + P and O = A - upfront.
import Big from 'big.js';
import { ZERO } from './money';
import { RuleError } from './errors';

export const PAYMENT_STATUSES = ['Paid', 'Partly paid', 'Outstanding'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Status shown for an amount and what has been received of it. */
export function statusOf(amount: Big, received: Big): PaymentStatus {
  if (received.gte(amount)) return 'Paid';
  return received.gt(0) ? 'Partly paid' : 'Outstanding';
}

/**
 * What counts as received for the status picked on the form: Paid = all of it, Outstanding = nothing,
 * Partly paid = the typed sum, which must be more than 0 and less than the amount.
 */
export function receivedFor(status: PaymentStatus, amount: Big, typed: Big | null): Big {
  if (status === 'Paid') return amount;
  if (status === 'Outstanding') return ZERO;
  if (!typed || typed.lte(0) || typed.gte(amount)) {
    throw new RuleError('For "Partly paid" the amount received must be more than 0 and less than the amount.');
  }
  return typed;
}

export interface OutstandingPart {
  amount: Big;
  paid: Big;
}

/**
 * The outstanding row an entry needs after it is saved with amount A and received R.
 *  - prev = its current outstanding row (null when there is none).
 *  - returns null when no row is needed (fully paid at entry and nothing collected later).
 * Payments already recorded on the outstanding row (prev.paid) are kept: R may not go below them.
 */
export function outstandingFor(amount: Big, received: Big, prev: OutstandingPart | null): OutstandingPart | null {
  if (received.gt(amount)) throw new RuleError('The amount received cannot be more than the amount.');
  if (!prev) {
    const rest = amount.minus(received);
    return rest.gt(0) ? { amount: rest, paid: ZERO } : null;
  }
  const upfront = received.minus(prev.paid);
  if (upfront.lt(0)) {
    throw new RuleError(`Rs ${prev.paid.toFixed(2)} was already collected on this entry's outstanding; the amount received cannot be less than that.`);
  }
  return { amount: amount.minus(upfront), paid: prev.paid };
}

/** A payment of x on an outstanding row: more than 0 and not more than what is still due. Returns the new paid. */
export function receive(row: OutstandingPart, x: Big): Big {
  const due = row.amount.minus(row.paid);
  if (x.lte(0)) throw new RuleError('The amount received must be more than 0.');
  if (x.gt(due)) throw new RuleError(`Only Rs ${due.toFixed(2)} is still due on this payment.`);
  return row.paid.plus(x);
}
