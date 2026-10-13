import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dashboard = readFileSync(new URL('../src/components/DashboardTab.tsx', import.meta.url), 'utf8');
const start = dashboard.indexOf('  const effectiveStaff =');
const end = dashboard.indexOf('  const effectiveRevenue =', start);
const calculate = new Function('staffList', 'role', 'currentStaffId', 'inTeam', 'filters', dashboard.slice(start, end) + 'return { effectiveStaff, totalTarget };');
const staff = [
  { id: 'a', dept: 'AIROLI', designation: 'Sales', project: 'P', individualTarget: 125000 },
  { id: 'b', dept: 'AIROLI', designation: 'Sales', project: 'Q', individualTarget: 75000 },
  { id: 'c', dept: 'BD', designation: 'Lead', project: 'P', individualTarget: 50000 },
];
const target = (role = 'Admin', filters = {}, current = 'a', team = id => id !== 'c') => calculate(staff, role, current, team, filters).totalTarget;
assert.equal(target(), 250000);
assert.equal(target('Admin', { dept: 'AIROLI' }), 200000);
assert.equal(target('Admin', { staffId: 'b' }), 75000);
assert.equal(target('Admin', { project: 'P' }), 175000);
assert.equal(target('Admin', { designation: 'Lead' }), 50000);
assert.equal(target('Staff'), 125000);
assert.equal(target('Incharge'), 200000);
assert.equal(target('Admin', { staffId: 'missing' }), 0);
staff[0].individualTarget = 0;
assert.equal(target('Staff'), 0);
staff[1].individualTarget = 90000;
assert.equal(target('Admin', { dept: 'AIROLI' }), 90000);
console.log('Saved target totals and role/filter checks passed');
