// Phone numbers of clients are stored as plain digits so the duplicate check catches the same number typed differently.
import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/services/clients';

describe('client phone numbers', () => {
  it('keeps the 10 digits of an Indian number however it is typed', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhone('098765 43210')).toBe('9876543210');
    expect(normalizePhone('9876543210')).toBe('9876543210');
  });
  it('empty stays empty; a landline with its STD code keeps 10 digits', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('022 2778 1234')).toBe('2227781234');
  });
});
