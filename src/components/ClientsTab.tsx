import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatINR, getTodayString } from '../utils/formatters';
import type { Client, ClientStatus, ClientVisit, RevenueType, VisitKind } from '../types';
import type { ClientInput } from '../api';

// Clients and their visits. The API decides who sees which client (team member: own clients, incharge: the
// department, admin / accounts: all); this screen only lists what it gets.

const box = 'w-full bg-[#fbfaf6] border border-[#c9c2b2] px-2.5 py-1.5 text-xs text-[#1f2a24] focus:outline-none focus:border-[#1b7a54]';
const label = 'block text-[11px] font-semibold text-[#5c665f] mb-1';
const btn = 'px-3 py-1.5 text-xs font-semibold text-white bg-[#1b7a54] disabled:opacity-50';
const btnPlain = 'px-3 py-1.5 text-xs font-semibold text-[#1f2a24] border border-[#c9c2b2] bg-[#fbfaf6]';
const panel = 'bg-[#fbfaf6] border border-[#d9d3c6]';

const STATUSES: ClientStatus[] = ['Lead', 'Active', 'Inactive'];
const KINDS: VisitKind[] = ['Visit', 'Call', 'Meeting', 'Demo', 'Email', 'Other'];
const CATEGORIES = ['Hospital', 'Clinic', 'Diagnostic centre', 'Corporate', 'Pharmacy', 'Doctor', 'Society', 'Individual'];

const statusTone: Record<ClientStatus, string> = {
  Lead: 'text-[#8a5a00] border-[#d9c27a] bg-[#fbf3dc]',
  Active: 'text-[#1b5e3f] border-[#a8cdb8] bg-[#e8f3ec]',
  Inactive: 'text-[#5c665f] border-[#d9d3c6] bg-[#f1eee6]',
};

const emptyForm = (staffId: string): ClientInput => ({
  name: '', type: 'Corporate', category: '', contactPerson: '', phone: '', email: '', address: '', city: '', pincode: '',
  status: 'Lead', notes: '', staffId,
});

export const ClientsTab: React.FC = () => {
  const {
    me, clients, visits, staffList, revenueEntries, outstandingPayments,
    addClient, updateClient, deleteClient, addVisit, updateVisit, deleteVisit,
  } = useApp();

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClientStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string>('');
  const [editing, setEditing] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<ClientInput>(emptyForm(me.staffId ?? ''));
  const [saving, setSaving] = useState(false);

  const today = getTodayString();
  const canPickOwner = me.role !== 'STAFF';
  // Owners an incharge may choose: their own department; admin / accounts: everyone.
  const ownerChoices = me.role === 'INCHARGE' ? staffList.filter(s => s.dept === me.dept) : staffList;

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clients.filter(c =>
      (statusFilter === 'ALL' || c.status === statusFilter) &&
      (!t || [c.name, c.contactPerson, c.phone ?? '', c.city, c.category].some(x => x.toLowerCase().includes(t))));
  }, [clients, q, statusFilter]);

  const selected = clients.find(c => c.id === selectedId) || null;
  useEffect(() => {
    if (selectedId && !selected) setSelectedId('');
  }, [selectedId, selected]);

  // Follow-ups due within a week (or overdue), from the latest visit of each client.
  const followUps = clients
    .filter(c => c.nextFollowUp && c.status !== 'Inactive' && c.nextFollowUp <= addDaysIso(today, 7))
    .sort((a, b) => (a.nextFollowUp! < b.nextFollowUp! ? -1 : 1));

  const set = (k: keyof ClientInput, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => {
    setForm(emptyForm(me.staffId ?? ownerChoices[0]?.id ?? ''));
    setEditing('new');
  };
  const openEdit = (c: Client) => {
    setForm({
      name: c.name, type: c.type, category: c.category, contactPerson: c.contactPerson, phone: c.phone ?? '', email: c.email ?? '',
      address: c.address, city: c.city, pincode: c.pincode ?? '', status: c.status, notes: c.notes, staffId: c.staffId,
    });
    setEditing('edit');
  };

  const saveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim() || saving) return;
    setSaving(true);
    const body: ClientInput = { ...form };
    if (!canPickOwner) delete body.staffId;
    if (editing === 'new') {
      const saved = await addClient(body);
      if (saved) { setSelectedId(saved.id); setEditing(null); }
    } else if (selected && (await updateClient(selected.id, body))) {
      setEditing(null);
    }
    setSaving(false);
  };

  const removeClient = async (c: Client) => {
    if (!window.confirm(`Delete ${c.name} and its ${c.visitCount} visit(s)? A client with revenue entries cannot be deleted; set it Inactive instead.`)) return;
    if (await deleteClient(c.id)) setSelectedId('');
  };

  return (
    <div className="space-y-5 pb-12 text-[#1f2a24]">
      {followUps.length > 0 && (
        <div className={`${panel} p-4`}>
          <h3 className="text-sm font-bold mb-2">Follow-ups due ({followUps.length})</h3>
          <div className="flex flex-wrap gap-2">
            {followUps.map(c => (
              <button key={c.id} onClick={() => { setSelectedId(c.id); setEditing(null); }}
                className={`text-xs px-2.5 py-1 border ${c.nextFollowUp! < today ? 'border-[#d9a3a3] bg-[#fbeaea] text-[#8a1f1f]' : 'border-[#d9d3c6] bg-white text-[#1f2a24]'}`}>
                {c.name}: {c.nextFollowUp! < today ? 'overdue since ' : ''}{formatDate(c.nextFollowUp!)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        {/* Client list */}
        <div className={panel}>
          <div className="p-3 border-b border-[#d9d3c6] space-y-2">
            <div className="flex gap-2">
              <input className={box} placeholder="Search name, contact, phone, city" value={q} onChange={e => setQ(e.target.value)} />
              <button className={`${btn} whitespace-nowrap`} onClick={openNew}>Add client</button>
            </div>
            <div className="flex gap-1 text-xs">
              {(['ALL', ...STATUSES] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1 border ${statusFilter === s ? 'bg-[#1b7a54] text-white border-[#1b7a54]' : 'border-[#d9d3c6] bg-white'}`}>
                  {s === 'ALL' ? `All (${clients.length})` : `${s} (${clients.filter(c => c.status === s).length})`}
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="p-4 text-xs text-[#5c665f]">
              {clients.length === 0 ? 'No clients yet. Add your first client with "Add client".' : 'No client matches this search.'}
            </p>
          ) : (
            <ul className="divide-y divide-[#e6e1d6] max-h-[70vh] overflow-y-auto">
              {filtered.map(c => (
                <li key={c.id}>
                  <button onClick={() => { setSelectedId(c.id); setEditing(null); }}
                    className={`w-full text-left px-3 py-2.5 text-xs ${c.id === selectedId ? 'bg-[#e8f3ec]' : 'bg-transparent'}`}>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-sm">{c.name}</span>
                      <span className={`px-1.5 border text-[10px] font-semibold ${statusTone[c.status]}`}>{c.status}</span>
                    </div>
                    <div className="text-[#5c665f] mt-0.5">
                      {[c.category, c.city, me.role === 'STAFF' ? '' : c.staffName].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-[#5c665f]">
                      {c.lastVisit ? `Last visit ${formatDate(c.lastVisit)}` : 'No visit yet'}
                      {c.nextFollowUp ? `, follow-up ${formatDate(c.nextFollowUp)}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right side: form or client detail */}
        <div className="space-y-5">
          {editing && (
            <form onSubmit={saveClient} className={`${panel} p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`}>
              <h3 className="sm:col-span-2 lg:col-span-3 text-sm font-bold">{editing === 'new' ? 'New client' : `Edit ${selected?.name ?? ''}`}</h3>
              <div className="lg:col-span-2"><label className={label}>Client / organisation name *</label>
                <input className={box} value={form.name} onChange={e => set('name', e.target.value)} required /></div>
              <div><label className={label}>Status</label>
                <select className={box} value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select></div>
              <div><label className={label}>Type</label>
                <select className={box} value={form.type} onChange={e => set('type', e.target.value as RevenueType)}>
                  <option>Corporate</option><option>Individual</option>
                </select></div>
              <div><label className={label}>Category</label>
                <input className={box} list="client-categories" value={form.category} onChange={e => set('category', e.target.value)} />
                <datalist id="client-categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist></div>
              <div><label className={label}>Contact person</label>
                <input className={box} value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></div>
              <div><label className={label}>Phone</label>
                <input className={box} inputMode="tel" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
              <div><label className={label}>Email</label>
                <input className={box} type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
              <div><label className={label}>City</label>
                <input className={box} value={form.city} onChange={e => set('city', e.target.value)} /></div>
              <div className="lg:col-span-2"><label className={label}>Address</label>
                <input className={box} value={form.address} onChange={e => set('address', e.target.value)} /></div>
              <div><label className={label}>PIN code</label>
                <input className={box} inputMode="numeric" value={form.pincode} onChange={e => set('pincode', e.target.value)} /></div>
              {canPickOwner && (
                <div><label className={label}>Managed by</label>
                  <select className={box} value={form.staffId} onChange={e => set('staffId', e.target.value)}>
                    {ownerChoices.map(s => <option key={s.id} value={s.id}>{s.name} ({s.dept})</option>)}
                  </select></div>
              )}
              <div className="sm:col-span-2 lg:col-span-3"><label className={label}>Notes</label>
                <textarea className={box} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                <button type="button" className={btnPlain} onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className={btn} disabled={saving}>{saving ? 'Saving...' : 'Save client'}</button>
              </div>
            </form>
          )}

          {!editing && !selected && (
            <div className={`${panel} p-6 text-xs text-[#5c665f]`}>
              Pick a client on the left to see their details, visits and revenue, or add a new client.
            </div>
          )}

          {!editing && selected && (
            <ClientDetail
              client={selected}
              visits={visits.filter(v => v.clientId === selected.id)}
              revenue={revenueEntries.filter(r => r.clientId === selected.id)}
              outstanding={outstandingPayments.filter(o => revenueEntries.some(r => r.clientId === selected.id && r.id === o.revenueEntryId))}
              onEdit={() => openEdit(selected)}
              onDelete={() => removeClient(selected)}
              onAddVisit={addVisit}
              onUpdateVisit={updateVisit}
              onDeleteVisit={deleteVisit}
              showCost={me.role !== 'STAFF'}
            />
          )}
        </div>
      </div>
    </div>
  );
};

function addDaysIso(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

interface DetailProps {
  client: Client;
  visits: ClientVisit[];
  revenue: ReturnType<typeof useApp>['revenueEntries'];
  outstanding: ReturnType<typeof useApp>['outstandingPayments'];
  onEdit: () => void;
  onDelete: () => void;
  onAddVisit: ReturnType<typeof useApp>['addVisit'];
  onUpdateVisit: ReturnType<typeof useApp>['updateVisit'];
  onDeleteVisit: ReturnType<typeof useApp>['deleteVisit'];
  showCost: boolean;
}

const ClientDetail: React.FC<DetailProps> = ({ client, visits, revenue, outstanding, onEdit, onDelete, onAddVisit, onUpdateVisit, onDeleteVisit, showCost }) => {
  const today = getTodayString();
  const blank = { date: today, kind: 'Visit' as VisitKind, purpose: '', notes: '', nextFollowUp: '' };
  const [v, setV] = useState(blank);
  const [editingVisit, setEditingVisit] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setV(blank); setEditingVisit(''); /* new client picked */ }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const revenueTotal = revenue.reduce((a, r) => a + r.amount, 0);
  const received = revenue.reduce((a, r) => a + r.amountReceived, 0);
  const due = outstanding.reduce((a, o) => a + (o.amount - o.amountPaid), 0);

  const saveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || (!v.purpose.trim() && !v.notes.trim())) return;
    setSaving(true);
    const body = { ...v, nextFollowUp: v.nextFollowUp || undefined };
    const ok = editingVisit ? await onUpdateVisit(editingVisit, body) : await onAddVisit({ ...body, clientId: client.id });
    setSaving(false);
    if (ok) { setV(blank); setEditingVisit(''); }
  };

  const contact = [client.contactPerson, client.phone, client.email].filter(Boolean).join(' · ');
  const place = [client.address, client.city, client.pincode].filter(Boolean).join(', ');

  return (
    <>
      <div className={`${panel} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold">{client.name}</h3>
              <span className={`px-1.5 border text-[10px] font-semibold ${statusTone[client.status]}`}>{client.status}</span>
            </div>
            <div className="text-xs text-[#5c665f] mt-1">
              {client.type}{client.category ? ` · ${client.category}` : ''} · managed by {client.staffName} ({client.dept})
            </div>
          </div>
          <div className="flex gap-2">
            <button className={btnPlain} onClick={onEdit}>Edit</button>
            <button className={btnPlain} onClick={onDelete}>Delete</button>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs mt-3">
          <div><dt className="inline text-[#5c665f]">Contact: </dt><dd className="inline">{contact || 'not added'}</dd></div>
          <div><dt className="inline text-[#5c665f]">Address: </dt><dd className="inline">{place || 'not added'}</dd></div>
          <div><dt className="inline text-[#5c665f]">Revenue: </dt><dd className="inline font-semibold">{formatINR(revenueTotal)} in {revenue.length} entr{revenue.length === 1 ? 'y' : 'ies'}</dd></div>
          <div><dt className="inline text-[#5c665f]">Received / due: </dt><dd className="inline">{formatINR(received)} / <span className={due > 0 ? 'text-[#8a1f1f] font-semibold' : ''}>{formatINR(due)}</span></dd></div>
        </dl>
        {client.notes && <p className="text-xs mt-3 whitespace-pre-line border-t border-[#e6e1d6] pt-2">{client.notes}</p>}
      </div>

      <div className={`${panel} p-4`}>
        <h3 className="text-sm font-bold mb-3">{editingVisit ? 'Change visit' : 'Log a visit or call'}</h3>
        <form onSubmit={saveVisit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div><label className={label}>Date</label>
            <input type="date" className={box} max={today} value={v.date} onChange={e => setV({ ...v, date: e.target.value })} required /></div>
          <div><label className={label}>Type</label>
            <select className={box} value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as VisitKind })}>
              {KINDS.map(k => <option key={k}>{k}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className={label}>Purpose</label>
            <input className={box} placeholder="e.g. Health camp proposal" value={v.purpose} onChange={e => setV({ ...v, purpose: e.target.value })} /></div>
          <div className="sm:col-span-3"><label className={label}>What happened</label>
            <input className={box} placeholder="Discussion, outcome, next step" value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
          <div><label className={label}>Next follow-up</label>
            <input type="date" className={box} min={v.date} value={v.nextFollowUp} onChange={e => setV({ ...v, nextFollowUp: e.target.value })} /></div>
          <div className="sm:col-span-4 flex justify-end gap-2">
            {editingVisit && <button type="button" className={btnPlain} onClick={() => { setEditingVisit(''); setV(blank); }}>Cancel</button>}
            <button type="submit" className={btn} disabled={saving || (!v.purpose.trim() && !v.notes.trim())}>
              {saving ? 'Saving...' : editingVisit ? 'Save visit' : 'Log visit'}
            </button>
          </div>
        </form>
      </div>

      <div className={panel}>
        <h3 className="text-sm font-bold px-4 pt-4 pb-2">Visits ({visits.length})</h3>
        {visits.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-[#5c665f]">No visits logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[#5c665f] border-y border-[#d9d3c6] bg-[#f1eee6]">
                  <th className="py-2 px-4">Date</th><th className="py-2 px-3">Type</th><th className="py-2 px-3">By</th>
                  <th className="py-2 px-3">Purpose and notes</th><th className="py-2 px-3">Follow-up</th><th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e1d6]">
                {visits.map(x => (
                  <tr key={x.id} className="align-top">
                    <td className="py-2 px-4 whitespace-nowrap">{formatDate(x.date)}</td>
                    <td className="py-2 px-3">{x.kind}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{x.staffName}</td>
                    <td className="py-2 px-3">
                      {x.purpose && <div className="font-semibold">{x.purpose}</div>}
                      {x.notes && <div className="text-[#3d4741]">{x.notes}</div>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">{x.nextFollowUp ? formatDate(x.nextFollowUp) : ''}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      <button className="underline mr-3" onClick={() => {
                        setEditingVisit(x.id);
                        setV({ date: x.date, kind: x.kind, purpose: x.purpose, notes: x.notes, nextFollowUp: x.nextFollowUp ?? '' });
                      }}>Edit</button>
                      <button className="underline" onClick={() => { if (window.confirm('Delete this visit?')) onDeleteVisit(x.id); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={panel}>
        <h3 className="text-sm font-bold px-4 pt-4 pb-2">Revenue entries ({revenue.length})</h3>
        {revenue.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-[#5c665f]">
            No revenue entry for this client yet. In Revenue entries, type this client's name and pick it from the list.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[#5c665f] border-y border-[#d9d3c6] bg-[#f1eee6]">
                  <th className="py-2 px-4">Date</th><th className="py-2 px-3">Staff</th><th className="py-2 px-3 text-right">Amount</th>
                  {showCost && <th className="py-2 px-3 text-right">Cost</th>}
                  <th className="py-2 px-3 text-right">Received</th><th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e1d6]">
                {revenue.map(r => (
                  <tr key={r.id}>
                    <td className="py-2 px-4 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-2 px-3">{r.staffName}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatINR(r.amount)}</td>
                    {showCost && <td className="py-2 px-3 text-right tabular-nums">{formatINR(r.cost)}</td>}
                    <td className="py-2 px-3 text-right tabular-nums">{formatINR(r.amountReceived)}</td>
                    <td className="py-2 px-3">{r.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
