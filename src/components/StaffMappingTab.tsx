import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/formatters';
import { DepartmentName, Staff } from '../types';
import { Plus } from 'lucide-react';

export const StaffMappingTab: React.FC = () => {
  const {
    staffList,
    departments,
    revenueEntries,
    addStaff,
    updateStaff,
    deleteStaff,
    accountsLogins,
    addAccountsLogin,
    removeAccountsLogin,
    setLoginPassword,
  } = useApp();

  // Password typed for a login (per email) until "Create login" / "Set password" is pressed.
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busyEmail, setBusyEmail] = useState('');

  // New staff inline add form
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState<DepartmentName>('AIROLI');
  const [newRole, setNewRole] = useState<'Incharge' | 'Team'>('Team');
  const [newDesignation, setNewDesignation] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newTarget, setNewTarget] = useState('150000');

  const [newEmail, setNewEmail] = useState('');

  const saveLogin = async (email: string) => {
    const pw = passwords[email] || '';
    if (!email || pw.length < 8) return;
    setBusyEmail(email);
    const ok = await setLoginPassword(email, pw);
    setBusyEmail('');
    if (ok) setPasswords(prev => ({ ...prev, [email]: '' }));
  };

  /** Email + login controls for one person (staff row or accounts email). */
  const loginControls = (email: string | undefined, hasLogin: boolean | undefined) => {
    const key = (email || '').trim().toLowerCase();
    const pw = passwords[key] || '';
    const busy = key !== '' && busyEmail === key;
    return (
      <div className="flex items-center gap-2">
        <span className={hasLogin ? 'text-emerald-700 font-semibold w-20' : 'text-slate-500 font-semibold w-20'}>
          {hasLogin ? 'Login active' : 'No login'}
        </span>
        <input
          type="password"
          autoComplete="new-password"
          placeholder={hasLogin ? 'New password' : 'Password (min 8)'}
          value={pw}
          disabled={!key}
          onChange={e => setPasswords(prev => ({ ...prev, [key]: e.target.value }))}
          className="w-36 bg-[#fbfaf6] border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:border-[#1b7a54] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => saveLogin(key)}
          disabled={!key || pw.length < 8 || busy}
          className="px-3 py-1 text-xs font-semibold text-white bg-[#1b7a54] disabled:opacity-40"
        >
          {busy ? 'Saving...' : hasLogin ? 'Set password' : 'Create login'}
        </button>
      </div>
    );
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDesignation.trim() || !newProject.trim()) return;

    const ok = await addStaff({
      name: newName,
      dept: newDept,
      role: newRole,
      designation: newDesignation,
      project: newProject,
      individualTarget: Number(newTarget) || 150000,
    });
    if (!ok) return;

    setNewName('');
    setNewDesignation('');
    setNewProject('');
    setNewTarget('150000');
  };

  const handleAddAccountEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) return;
    if (await addAccountsLogin(newEmail.trim())) setNewEmail('');
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 5 Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {departments.map(dept => {
          const deptStaff = staffList.filter(s => s.dept === dept.name);
          const deptRevs = revenueEntries.filter(r => r.dept === dept.name);
          const allocated = deptRevs.reduce((acc, r) => acc + r.amount, 0);
          const gap = dept.target - allocated;

          return (
            <div
              key={dept.name}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 flex flex-col justify-between gap-4"
            >
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">{dept.name}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Dept target ₹{dept.target.toLocaleString('en-IN')} <br />
                  Allocated ₹{allocated.toLocaleString('en-IN')}{' '}
                  <span className={gap > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    ({gap > 0 ? `gap ₹${gap.toLocaleString('en-IN')}` : 'covered'})
                  </span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(Math.round((allocated / dept.target) * 100), 100)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                {deptStaff.length === 0 ? (
                  <p className="text-slate-400 italic">No staff mapped</p>
                ) : (
                  deptStaff.map(s => (
                    <div key={s.id} className="text-slate-700">
                      <strong className="text-slate-900">{s.name}</strong> – {s.designation} · {formatINR(s.individualTarget)}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Department-wise Logins Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 p-6">
        <h3 className="text-base font-bold text-slate-900 mb-1">Department-wise logins</h3>
        <p className="text-xs text-slate-500 mb-6">
          Put each person's work email on their row once: when they sign in with it they open the CRM straight into their
          own view and fill data daily. An Incharge also sees the whole department. Then set a password with Create login
          and share it with them.
        </p>

        <div className="space-y-6">
          {departments.map(dept => {
            const deptStaff = staffList.filter(s => s.dept === dept.name);
            const linkedCount = deptStaff.filter(s => s.email).length;

            return (
              <div key={dept.name} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <span>{dept.name}</span>
                  <span className={linkedCount > 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                    {linkedCount}/{deptStaff.length} linked
                  </span>
                </div>

                {deptStaff.length === 0 ? (
                  <p className="text-xs text-slate-400 pl-4">No staff</p>
                ) : (
                  <div className="space-y-2 pl-4">
                    {deptStaff.map(s => (
                      <div key={s.id} className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="w-56">
                          <strong className="text-slate-900">{s.name}</strong>{' '}
                          <span className="text-slate-500">{s.designation}</span>
                        </div>
                        <input
                          type="email"
                          placeholder="name@secondmedic.com"
                          value={s.email ?? ''}
                          onChange={e => updateStaff(s.id, { email: e.target.value })}
                          className="w-60 bg-[#fbfaf6] border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:border-[#1b7a54]"
                        />
                        {loginControls(s.email, s.hasLogin)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff & Monthly Targets Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">Staff & monthly targets</h3>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Designation</th>
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Monthly Target ₹</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffList.map(stf => (
                <tr key={stf.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    <input
                      type="text"
                      value={stf.name}
                      onChange={e => updateStaff(stf.id, { name: e.target.value })}
                      className="bg-transparent border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none focus:border-emerald-500"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={stf.dept}
                      onChange={e => updateStaff(stf.id, { dept: e.target.value as DepartmentName })}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none"
                    >
                      {departments.map(d => (
                        <option key={d.name} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={stf.role}
                      onChange={e => updateStaff(stf.id, { role: e.target.value as 'Incharge' | 'Team' })}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none"
                    >
                      <option value="Team">Team</option>
                      <option value="Incharge">Incharge</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={stf.designation}
                      onChange={e => updateStaff(stf.id, { designation: e.target.value })}
                      className="bg-transparent border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={stf.project}
                      onChange={e => updateStaff(stf.id, { project: e.target.value })}
                      className="bg-transparent border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none"
                    />
                  </td>
                  <td className="py-3 px-4 font-mono">
                    <input
                      type="number"
                      value={stf.individualTarget}
                      onChange={e => updateStaff(stf.id, { individualTarget: Number(e.target.value) || 0 })}
                      className="bg-transparent border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none"
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${stf.name} from the team? Their past entries stay in the reports.`)) deleteStaff(stf.id);
                      }}
                      className="p-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center justify-center"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Staff Inline Form */}
        <form onSubmit={handleAddStaffSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-4 border-t border-slate-200">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Name</label>
            <input
              type="text"
              placeholder="Staff name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Dept</label>
            <select
              value={newDept}
              onChange={e => setNewDept(e.target.value as DepartmentName)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            >
              {departments.map(d => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Role</label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as 'Incharge' | 'Team')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            >
              <option value="Team">Team</option>
              <option value="Incharge">Incharge</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Designation</label>
            <input
              type="text"
              placeholder="Designation"
              value={newDesignation}
              onChange={e => setNewDesignation(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Project</label>
            <input
              type="text"
              placeholder="Project"
              value={newProject}
              onChange={e => setNewProject(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Target ₹</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Target"
                value={newTarget}
                onChange={e => setNewTarget(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all shrink-0"
              >
                Add staff
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Accounts Team Logins Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">Accounts team logins</h3>
        {accountsLogins.length === 0 ? (
          <p className="text-xs text-slate-400 mb-4">No accounts team member linked yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {accountsLogins.map(a => (
              <div key={a.email} className="flex flex-wrap items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 text-xs">
                <span className="font-medium text-slate-800 w-60">{a.email}</span>
                {loginControls(a.email, a.hasLogin)}
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${a.email} from the accounts team? Their login stays but no longer opens the CRM.`)) {
                      removeAccountsLogin(a.email);
                    }
                  }}
                  className="text-slate-500 underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddAccountEmail} className="flex gap-3 max-w-md">
          <input
            type="email"
            placeholder="accounts@secondmedic.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add accounts person
          </button>
        </form>
      </div>

      <div className="text-[11px] text-slate-400 text-center pt-4">
        Department targets (Airoli 6L, MDSA 7L, Corporate 6L, BD 6L, Campaign 6L = 31L) are used for department progress.
      </div>
    </div>
  );
};
