import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR, getTodayString } from '../utils/formatters';

// My team (incharge view): the staff who report to this incharge. The incharge adds team members, keeps their
// designation / project / monthly target / work email up to date and makes their logins. Role, department and who
// someone reports to are changed by the admin in Staff mapping.

const box = 'w-full bg-[#fbfaf6] border border-[#c9c2b2] px-2.5 py-1.5 text-xs text-[#1f2a24] focus:outline-none focus:border-[#1b7a54]';
const label = 'block text-[11px] font-semibold text-[#5c665f] mb-1';
const btn = 'px-3 py-1.5 text-xs font-semibold text-white bg-[#1b7a54] disabled:opacity-50 whitespace-nowrap';
const panel = 'bg-[#fbfaf6] border border-[#d9d3c6]';

export const MyTeamTab: React.FC = () => {
  const { staffList, currentStaffId, addStaff, updateStaff, deleteStaff, setLoginPassword, revenueEntries, me } = useApp();
  const lead = staffList.find(s => s.id === currentStaffId);
  const team = staffList.filter(s => s.inchargeId === currentStaffId);

  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [project, setProject] = useState('');
  const [target, setTarget] = useState('150000');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  if (!lead) {
    return (
      <div className={`${panel} p-6 text-xs text-[#5c665f]`}>
        Your login is not linked to your staff row yet. Ask the admin to put your email on your row in Staff mapping.
      </div>
    );
  }

  const thisMonth = getTodayString().slice(0, 7);
  const monthRevenue = (id: string) => revenueEntries.filter(r => r.staffId === id && r.date.startsWith(thisMonth)).reduce((a, r) => a + r.amount, 0);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const ok = await addStaff({
      name, designation, project, individualTarget: Number(target) || 0, email: email.trim() || undefined, role: 'Team',
      // An admin previewing this view adds the person to the incharge being previewed.
      ...(me.role === 'ADMIN' ? { inchargeId: lead.id, dept: lead.dept } : {}),
    });
    setSaving(false);
    if (ok) { setName(''); setDesignation(''); setProject(''); setTarget('150000'); setEmail(''); }
  };

  const saveLogin = async (mail: string) => {
    const pw = passwords[mail] || '';
    if (pw.length < 8) return;
    setBusy(mail);
    const ok = await setLoginPassword(mail, pw);
    setBusy('');
    if (ok) setPasswords(p => ({ ...p, [mail]: '' }));
  };

  return (
    <div className="space-y-5 pb-12 text-[#1f2a24]">
      <div className={`${panel} p-4`}>
        <h3 className="text-sm font-bold">{lead.name}'s team, {lead.dept}</h3>
        <p className="text-xs text-[#5c665f] mt-1">
          {team.length} {team.length === 1 ? 'person reports' : 'people report'} to you. Their entries, outstanding payments, clients and
          daily updates show in your views. Put each person's work email here and make their login so they can sign in.
        </p>
      </div>

      <div className={panel}>
        {team.length === 0 ? (
          <p className="p-4 text-xs text-[#5c665f]">Nobody reports to you yet. Add your first team member below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[#5c665f] border-b border-[#d9d3c6] bg-[#f1eee6]">
                  <th className="py-2 px-3">Name</th><th className="py-2 px-3">Designation</th><th className="py-2 px-3">Project</th>
                  <th className="py-2 px-3">Monthly target</th><th className="py-2 px-3 text-right">This month</th>
                  <th className="py-2 px-3">Work email</th><th className="py-2 px-3">Login</th><th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e1d6]">
                {team.map(s => {
                  const mail = (s.email ?? '').trim().toLowerCase();
                  const pw = passwords[mail] || '';
                  const saving = mail !== '' && busy === mail;
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="py-2 px-3 min-w-[140px]"><input className={box} value={s.name} onChange={e => updateStaff(s.id, { name: e.target.value })} /></td>
                      <td className="py-2 px-3 min-w-[150px]"><input className={box} value={s.designation} onChange={e => updateStaff(s.id, { designation: e.target.value })} /></td>
                      <td className="py-2 px-3 min-w-[130px]"><input className={box} value={s.project} onChange={e => updateStaff(s.id, { project: e.target.value })} /></td>
                      <td className="py-2 px-3 w-32"><input className={box} type="number" min={0} value={s.individualTarget}
                        onChange={e => updateStaff(s.id, { individualTarget: Number(e.target.value) || 0 })} /></td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{formatINR(monthRevenue(s.id))}</td>
                      <td className="py-2 px-3 min-w-[200px]"><input className={box} type="email" placeholder="name@secondmedic.com" value={s.email ?? ''}
                        onChange={e => updateStaff(s.id, { email: e.target.value })} /></td>
                      <td className="py-2 px-3 min-w-[230px]">
                        <div className="flex gap-2 items-center">
                          <span className={s.hasLogin ? 'text-[#1b5e3f] font-semibold w-16' : 'text-[#5c665f] w-16'}>{s.hasLogin ? 'Active' : 'None'}</span>
                          <input className={box} type="password" autoComplete="new-password" disabled={!mail}
                            placeholder={s.hasLogin ? 'New password' : 'Password (min 8)'} value={pw}
                            onChange={e => setPasswords(p => ({ ...p, [mail]: e.target.value }))} />
                          <button className={btn} disabled={!mail || pw.length < 8 || saving} onClick={() => saveLogin(mail)}>
                            {saving ? 'Saving...' : s.hasLogin ? 'Set' : 'Create'}
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <button className="underline text-[#5c665f]" onClick={() => {
                          if (window.confirm(`Remove ${s.name} from your team? Their past entries stay in the reports.`)) deleteStaff(s.id);
                        }}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={add} className={`${panel} p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end`}>
        <h3 className="sm:col-span-2 lg:col-span-6 text-sm font-bold">Add a team member</h3>
        <div><label className={label}>Name *</label><input className={box} value={name} onChange={e => setName(e.target.value)} required /></div>
        <div><label className={label}>Designation</label><input className={box} value={designation} onChange={e => setDesignation(e.target.value)} /></div>
        <div><label className={label}>Project</label><input className={box} value={project} onChange={e => setProject(e.target.value)} /></div>
        <div><label className={label}>Monthly target</label><input className={box} type="number" min={0} value={target} onChange={e => setTarget(e.target.value)} /></div>
        <div><label className={label}>Work email</label><input className={box} type="email" placeholder="name@secondmedic.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><button type="submit" className={btn} disabled={saving || !name.trim()}>{saving ? 'Adding...' : 'Add to my team'}</button></div>
      </form>
    </div>
  );
};
