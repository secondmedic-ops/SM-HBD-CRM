import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR, formatDate, getTodayString } from '../utils/formatters';
import { OutstandingPayment } from '../types';
import { ImageViewerModal } from './ImageViewerModal';
import { shrinkImage } from '../lib/image';
import { Image } from 'lucide-react';

export const OutstandingTab: React.FC = () => {
  const { outstandingPayments, markOutstandingReceived, addOutstanding, staffList, role, currentStaffId, loadImage, inTeam } = useApp();

  const [client, setClient] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(getTodayString());
  const [staffId, setStaffId] = useState(currentStaffId || staffList[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [receivingItem, setReceivingItem] = useState<OutstandingPayment | null>(null);
  const [receiveAmount, setReceiveAmount] = useState('');

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setScreenshot(await shrinkImage(file));
      setImageError('');
    } catch (err: any) {
      setImageError(err?.message || 'This image could not be read.');
    }
  };

  const openImage = async (id?: string) => {
    if (!id) return;
    const url = await loadImage(id);
    if (url) setPreviewImage(url);
  };

  const handleAddOutstanding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client.trim() || !amount || isNaN(Number(amount)) || saving) return;
    const stf = staffList.find(s => s.id === staffId) || staffList[0];
    if (!stf) return;

    setSaving(true);
    const ok = await addOutstanding({
      client,
      staffId: stf.id,
      amount: Number(amount),
      dueDate,
      screenshot: screenshot || undefined,
    });
    setSaving(false);
    if (!ok) return;

    setClient('');
    setAmount('');
    setScreenshot('');
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingItem || !receiveAmount || isNaN(Number(receiveAmount))) return;

    const numPaid = Number(receiveAmount);
    if (!(await markOutstandingReceived(receivingItem.id, numPaid))) return;
    setReceivingItem(null);
    setReceiveAmount('');
  };

  const effectiveOutstanding = outstandingPayments.filter(o => {
    if (role === 'Staff' && o.staffId !== currentStaffId) return false;
    if (role === 'Incharge' && !inTeam(o.staffId)) return false;
    return true;
  });

  const totalOutstandingAmount = effectiveOutstanding
    .filter(o => o.status === 'Pending')
    .reduce((acc, o) => acc + (o.amount - o.amountPaid), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Upload Outstanding Payment Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">Upload outstanding payment</h3>

        <form onSubmit={handleAddOutstanding} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Client</label>
            <input
              type="text"
              placeholder=""
              value={client}
              onChange={e => setClient(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#1b7a54]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Staff</label>
            <select
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              disabled={role === 'Staff'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            >
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Amount ₹</label>
            <input
              type="number"
              placeholder=""
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#1b7a54]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Screenshot</label>
            <div className="flex gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleScreenshotUpload}
                className="w-full text-[10px] text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-semibold file:bg-slate-100 file:text-slate-700 cursor-pointer"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1b7a54] rounded-xl hover:bg-[#156344] transition-all shrink-0 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Submit'}
              </button>
            </div>
            {imageError && <span className="text-[10px] text-rose-500 mt-0.5 block">{imageError}</span>}
          </div>
        </form>
      </div>

      {/* Outstanding Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">
          Outstanding: <span className="font-mono text-rose-600">{formatINR(totalOutstandingAmount)}</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Staff</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Due</th>
                <th className="py-3 px-4">Proof</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {effectiveOutstanding.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-slate-400 italic">Nothing outstanding.</td>
                </tr>
              ) : (
                effectiveOutstanding.map(item => {
                  const balance = item.amount - item.amountPaid;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{item.client}</td>
                      <td className="py-3 px-4 text-slate-700">{item.staffName}</td>
                      <td className="py-3 px-4 font-mono font-semibold">{formatINR(balance)}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(item.dueDate)}</td>
                      <td className="py-3 px-4">
                        {item.screenshotId ? (
                          <button
                            onClick={() => openImage(item.screenshotId)}
                            className="flex items-center gap-1 text-emerald-600 hover:underline font-medium"
                          >
                            <Image className="w-3.5 h-3.5" /> View
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${item.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {item.status !== 'Paid' && (
                          <button
                            onClick={() => {
                              setReceivingItem(item);
                              setReceiveAmount(String(balance));
                            }}
                            className="px-3 py-1 text-xs font-semibold text-white bg-[#1b7a54] rounded-lg hover:bg-[#156344] transition-colors"
                          >
                            Mark received
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {receivingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900 mb-2">Mark Payment Received</h3>
            <p className="text-xs text-slate-500 mb-4">
              Client: <strong className="text-slate-800">{receivingItem.client}</strong>
            </p>

            <form onSubmit={handleConfirmReceive} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Amount Received Now (₹)</label>
                <input
                  type="number"
                  value={receiveAmount}
                  onChange={e => setReceiveAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReceivingItem(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#1b7a54] rounded-xl hover:bg-[#156344]"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewImage && <ImageViewerModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  );
};
