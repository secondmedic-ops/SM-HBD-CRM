import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getTodayString, formatDate } from '../utils/formatters';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';

export const DailyUpdatesTab: React.FC = () => {
  const { dailyUpdates, staffList, addDailyUpdate, currentStaffId, selectedMonth, me, role } = useApp();

  const todayStr = getTodayString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [updateText, setUpdateText] = useState('');
  const [clientMetCount, setClientMetCount] = useState('2');

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr) || new Date().getFullYear();
  const month = parseInt(monthStr) ? parseInt(monthStr) - 1 : new Date().getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  });

  // Admin / accounts can post for anyone (pick the person); everyone else posts their own update.
  const canPick = me.role === 'ADMIN' || me.role === 'ACCOUNTS';
  const [pickedStaffId, setPickedStaffId] = useState<string>('');
  const currentUser = canPick
    ? staffList.find(s => s.id === (pickedStaffId || currentStaffId)) || staffList[0]
    : staffList.find(s => s.id === currentStaffId);
  const [saving, setSaving] = useState(false);

  // The team in view: everyone for admin / accounts, otherwise the login's own department.
  const viewDept = role === 'Admin' || role === 'Accounts team' ? null : staffList.find(s => s.id === currentStaffId)?.dept ?? me.dept ?? null;
  const team = viewDept ? staffList.filter(s => s.dept === viewDept) : staffList;

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateText.trim() || !currentUser || saving) return;

    setSaving(true);
    const ok = await addDailyUpdate({
      date: selectedDate,
      staffId: currentUser.id,
      updateText,
      clientMetCount: Math.max(0, Math.floor(Number(clientMetCount) || 0)),
    });
    setSaving(false);
    if (ok) setUpdateText('');
  };

  const todayUpdates = dailyUpdates.filter(u => u.date === todayStr);
  const submittedStaffIds = new Set(todayUpdates.map(u => u.staffId));

  const submittedStaff = team.filter(s => submittedStaffIds.has(s.id));
  const pendingStaff = team.filter(s => !submittedStaffIds.has(s.id));

  const selectedDayUpdates = dailyUpdates.filter(u => u.date === selectedDate);

  return (
    <div className="space-y-6 pb-12">
      {/* Today's Filling Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] p-6">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">Today's filling status, {formatDate(todayStr)}</h3>
          <span className="text-xs text-slate-500 font-semibold">
            {viewDept ?? 'All departments'} {submittedStaff.length}/{team.length} filled
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {submittedStaff.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✓ {s.name}
            </span>
          ))}
          {pendingStaff.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              ✕ {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar Grid Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">
          Calendar, {year}-{String(month + 1).padStart(2, '0')} (dimmed days are outside the selected range)
        </h3>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
          <div>S</div>
          <div>M</div>
          <div>T</div>
          <div>W</div>
          <div>T</div>
          <div>F</div>
          <div>S</div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
            <div key={`empty-${idx}`} />
          ))}
          {daysArray.map(dateStr => {
            const hasUpdates = dailyUpdates.some(u => u.date === dateStr);
            const isSelected = selectedDate === dateStr;
            const dayNum = dateStr.split('-')[2];

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative h-16 rounded-2xl p-2 flex flex-col justify-between text-xs font-semibold transition-all border ${
                  isSelected
                    ? 'bg-[#1b7a54] text-white border-[#1b7a54] shadow-md'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>{parseInt(dayNum)}</span>
                {hasUpdates && (
                  <span className={`w-2 h-2 rounded-full self-center ${isSelected ? 'bg-white' : 'bg-[#1b7a54]'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Updates Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">Updates for {selectedDate}</h3>

        {selectedDayUpdates.length === 0 ? (
          <p className="text-xs text-slate-400 mb-6 italic">No updates.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {selectedDayUpdates.map(upd => (
              <div key={upd.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="flex justify-between font-bold text-slate-900 mb-1">
                  <span>{upd.staffName}</span>
                  <span className="text-emerald-600">{upd.clientMetCount} clients met</span>
                </div>
                <p className="text-slate-700">{upd.updateText}</p>
              </div>
            ))}
          </div>
        )}

        {!currentUser ? (
          <p className="text-xs text-slate-500 pt-4 border-t border-slate-100">
            Your login is not linked to a staff member yet, so you cannot post an update. Ask the admin to put your email on
            your row in Staff mapping.
          </p>
        ) : (
        <form onSubmit={handleSubmitUpdate} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-4 border-t border-slate-100 items-end">
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Staff</label>
            <select
              value={currentUser.id}
              disabled={!canPick}
              onChange={e => setPickedStaffId(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium"
            >
              {(canPick ? staffList : [currentUser]).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Daily update</label>
            <input
              type="text"
              placeholder="Enter your daily update notes..."
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#1b7a54]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Clients met</label>
            <input
              type="number"
              min={0}
              value={clientMetCount}
              onChange={e => setClientMetCount(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#1b7a54]"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 text-xs font-semibold text-white bg-[#1b7a54] rounded-xl hover:bg-[#156344] transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> {saving ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
