import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR, formatDate } from '../utils/formatters';
import { RevenueEntry, PaymentStatus, RevenueType } from '../types';
import { ImageViewerModal } from './ImageViewerModal';
import { shrinkImage } from '../lib/image';
import { Plus, Trash2, Edit3, Image, CheckCircle, Clock, XCircle, Search } from 'lucide-react';

export const RevenueEntriesTab: React.FC = () => {
  const {
    revenueEntries,
    staffList,
    addRevenueEntry,
    updateRevenueEntry,
    deleteRevenueEntry,
    role,
    currentStaffId,
    loadImage,
    clients,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [staffId, setStaffId] = useState(currentStaffId || staffList[0]?.id || '');
  const [client, setClient] = useState('');
  const [type, setType] = useState<RevenueType>('Individual');
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [amountReceived, setAmountReceived] = useState('');
  const [dueDate, setDueDate] = useState('');
  // A newly chosen slip (shrunk data URL); an entry being edited keeps its saved slip unless a new one is chosen.
  const [slipImage, setSlipImage] = useState<string>('');
  const [savedSlipId, setSavedSlipId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSlipImage(await shrinkImage(file));
      setErrors(prev => ({ ...prev, slip: '' }));
    } catch (err: any) {
      setErrors(prev => ({ ...prev, slip: err?.message || 'This image could not be read.' }));
    }
  };

  const openImage = async (id?: string) => {
    if (!id) return;
    const url = await loadImage(id);
    if (url) setPreviewImage(url);
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!client.trim()) errs.client = 'Client name is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs.amount = 'Valid amount is required';
    // Team members do not enter cost (they never see it); the API keeps cost for them.
    if (role !== 'Staff' && (cost === '' || isNaN(Number(cost)) || Number(cost) < 0)) errs.cost = 'Valid cost is required';
    if (paymentStatus === 'Partly paid' && (!amountReceived || Number(amountReceived) >= Number(amount))) {
      errs.amountReceived = 'Valid partial amount received required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || saving) return;

    const numAmount = Number(amount);
    let finalReceived = numAmount;
    if (paymentStatus === 'Outstanding') finalReceived = 0;
    if (paymentStatus === 'Partly paid') finalReceived = Number(amountReceived) || 0;

    // A name picked from the Clients list links the entry to that client.
    const linked = clients.find(c => c.name.toLowerCase() === client.trim().toLowerCase());
    const input = {
      date,
      staffId,
      client,
      clientId: linked?.id,
      type,
      amount: numAmount,
      cost: role === 'Staff' ? undefined : Number(cost),
      isNewClient,
      paymentStatus,
      amountReceived: finalReceived,
      dueDate: paymentStatus === 'Paid' ? undefined : dueDate || undefined,
      slipImage: slipImage || undefined,
    };

    setSaving(true);
    const ok = editingId ? await updateRevenueEntry(editingId, input) : await addRevenueEntry(input);
    setSaving(false);
    if (!ok) return; // the reason shows in the bar at the top; the form keeps what was typed

    setEditingId(null);
    setClient('');
    setAmount('');
    setCost('');
    setIsNewClient(false);
    setPaymentStatus('Paid');
    setAmountReceived('');
    setDueDate('');
    setSlipImage('');
    setSavedSlipId('');
    setShowForm(false);
    setErrors({});
  };

  const handleEdit = (entry: RevenueEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setStaffId(entry.staffId);
    setClient(entry.client);
    setType(entry.type);
    setAmount(String(entry.amount));
    setCost(String(entry.cost));
    setIsNewClient(entry.isNewClient);
    setPaymentStatus(entry.paymentStatus);
    setAmountReceived(String(entry.amountReceived));
    setDueDate(entry.dueDate || '');
    setSlipImage('');
    setSavedSlipId(entry.slipId || '');
    setShowForm(true);
  };

  const effectiveEntries = revenueEntries.filter(r => {
    if (role === 'Staff' && r.staffId !== currentStaffId) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        r.client.toLowerCase().includes(term) ||
        r.staffName.toLowerCase().includes(term) ||
        r.dept.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, staff or department..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1b7a54]"
          />
        </div>

        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1b7a54] rounded-xl shadow-md hover:bg-[#156344] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Revenue Entry</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-200 border-l-4 border-l-[#1b7a54]">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              {editingId ? 'Edit Revenue Entry' : 'New Revenue Entry'}
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Staff Member</label>
              <select
                value={staffId}
                onChange={e => setStaffId(e.target.value)}
                disabled={role === 'Staff'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
              >
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.dept})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Client Name</label>
              <input
                type="text"
                placeholder="e.g. Apollo Hospital"
                list="revenue-clients"
                value={client}
                onChange={e => setClient(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
              />
              <datalist id="revenue-clients">
                {clients.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
              {client.trim() && clients.some(c => c.name.toLowerCase() === client.trim().toLowerCase()) && (
                <span className="text-[10px] text-slate-500 mt-0.5 block">Linked to this client in Clients</span>
              )}
              {errors.client && <span className="text-[10px] text-rose-500 mt-0.5 block">{errors.client}</span>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Revenue Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as RevenueType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
              >
                <option value="Individual">Individual</option>
                <option value="Corporate">Corporate</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (₹)</label>
              <input
                type="number"
                placeholder="50000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
              />
              {errors.amount && <span className="text-[10px] text-rose-500 mt-0.5 block">{errors.amount}</span>}
            </div>

            {role !== 'Staff' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cost (₹)</label>
                <input
                  type="number"
                  placeholder="15000"
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                />
                {errors.cost && <span className="text-[10px] text-rose-500 mt-0.5 block">{errors.cost}</span>}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={e => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
              >
                <option value="Paid">Paid</option>
                <option value="Partly paid">Partly paid</option>
                <option value="Outstanding">Outstanding</option>
              </select>
            </div>

            {paymentStatus === 'Partly paid' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Amount Received (₹)</label>
                <input
                  type="number"
                  placeholder="25000"
                  value={amountReceived}
                  onChange={e => setAmountReceived(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                />
                {errors.amountReceived && <span className="text-[10px] text-rose-500 mt-0.5 block">{errors.amountReceived}</span>}
              </div>
            )}

            {(paymentStatus === 'Outstanding' || paymentStatus === 'Partly paid') && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="isNewClient"
                checked={isNewClient}
                onChange={e => setIsNewClient(e.target.checked)}
                className="w-4 h-4 rounded text-[#1b7a54] focus:ring-[#1b7a54]"
              />
              <label htmlFor="isNewClient" className="text-xs font-semibold text-slate-700">
                New Client Acquisition
              </label>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Slip / Screenshot</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
              {slipImage && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={slipImage} alt="Slip preview" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                  <span className="text-xs text-emerald-600 font-medium">Slip attached successfully</span>
                </div>
              )}
              {!slipImage && savedSlipId && (
                <button type="button" onClick={() => openImage(savedSlipId)} className="mt-2 text-xs underline text-slate-600">
                  View saved slip (choose a file to replace it)
                </button>
              )}
              {errors.slip && <span className="text-[10px] text-rose-500 mt-0.5 block">{errors.slip}</span>}
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#1b7a54] rounded-xl shadow-md hover:bg-[#156344] transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Revenue Entries</h3>
          <span className="text-xs text-slate-500">{effectiveEntries.length} entries found</span>
        </div>

        {effectiveEntries.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No entries in this range</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Staff</th>
                  <th className="py-3.5 px-6">Client</th>
                  <th className="py-3.5 px-6">Type</th>
                  <th className="py-3.5 px-6">Amount</th>
                  {role !== 'Staff' && <th className="py-3.5 px-6">Cost</th>}
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Slip</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {effectiveEntries.map(entry => {
                  let badge = null;
                  if (entry.paymentStatus === 'Paid') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        <CheckCircle className="w-3 h-3" /> Paid
                      </span>
                    );
                  } else if (entry.paymentStatus === 'Partly paid') {
                    const balance = entry.amount - entry.amountReceived;
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                        <Clock className="w-3 h-3" /> Partly · due {formatINR(balance)}
                      </span>
                    );
                  } else {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">
                        <XCircle className="w-3 h-3" /> Outstanding
                      </span>
                    );
                  }

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 text-slate-600 text-xs">{formatDate(entry.date)}</td>
                      <td className="py-4 px-6 font-semibold text-slate-900">
                        <div>{entry.staffName}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{entry.dept}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-900">{entry.client}</div>
                        {entry.isNewClient && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                            New Client
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600 text-xs">{entry.type}</td>
                      <td className="py-4 px-6 font-mono tabular-nums font-bold text-slate-900">{formatINR(entry.amount)}</td>
                      {role !== 'Staff' && (
                        <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(entry.cost)}</td>
                      )}
                      <td className="py-4 px-6">{badge}</td>
                      <td className="py-4 px-6">
                        {entry.slipId ? (
                          <button
                            onClick={() => openImage(entry.slipId)}
                            className="flex items-center gap-1 text-xs text-emerald-600 hover:underline font-medium"
                          >
                            <Image className="w-4 h-4" /> View
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {role !== 'Staff' && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete the entry for ${entry.client} (${formatINR(entry.amount)})? Its outstanding payment is deleted too.`)) {
                                  deleteRevenueEntry(entry.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewImage && <ImageViewerModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  );
};
