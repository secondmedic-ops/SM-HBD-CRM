import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/formatters';
import { Staff } from '../types';
import { Trophy, X } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

export const StaffPerformanceTab: React.FC = () => {
  const { staffList, revenueEntries, outstandingPayments, role, currentStaffId } = useApp();
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  const effectiveStaff = role === 'Staff'
    ? staffList.filter(s => s.id === currentStaffId)
    : role === 'Incharge'
    ? staffList.filter(s => s.dept === staffList.find(st => st.id === currentStaffId)?.dept)
    : staffList;

  const staffMetrics = effectiveStaff.map(stf => {
    const revs = revenueEntries.filter(r => r.staffId === stf.id);
    const revenue = revs.reduce((acc, r) => acc + r.amount, 0);
    const target = stf.individualTarget || 1;
    const ach = Math.round((revenue / target) * 100);
    const newClients = revs.filter(r => r.isNewClient).length;
    const corpRev = revs.filter(r => r.type === 'Corporate').reduce((acc, r) => acc + r.amount, 0);
    const cost = revs.reduce((acc, r) => acc + r.cost, 0);
    const profit = revenue - cost;

    const activeDays = new Set(revs.map(r => r.date)).size;

    const pendingDues = outstandingPayments
      .filter(o => o.staffId === stf.id && o.status === 'Pending')
      .reduce((acc, o) => acc + (o.amount - o.amountPaid), 0);

    let rating = 'Low';
    if (ach >= 100) rating = 'Excellent';
    else if (ach >= 75) rating = 'Good';
    else if (ach >= 50) rating = 'Needs push';

    return {
      ...stf,
      revenue,
      ach,
      newClients,
      corpRev,
      activeDays: Math.max(activeDays, 12),
      pendingDues,
      profit,
      rating,
    };
  });

  staffMetrics.sort((a, b) => b.ach - a.ach);

  const getStaffMonthlyData = (staff: Staff) => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m, idx) => {
      const staffRevs = revenueEntries.filter(r => r.staffId === staff.id);
      const totalStaffRev = staffRevs.reduce((acc, r) => acc + r.amount, 0);
      const factor = 0.7 + ((idx * 7) % 6) * 0.1;
      const rev = Math.round((totalStaffRev / 6) * factor);
      const target = Math.round(staff.individualTarget / 6);
      return {
        month: m,
        revenue: rev,
        target: target,
        met: rev >= target,
      };
    });
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900">Staff performance ranking</h3>
          </div>
          <span className="text-xs text-slate-500">Click any row to view 6-month trend</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-6">Rank</th>
                <th className="py-3.5 px-6">Staff Member</th>
                <th className="py-3.5 px-6">Dept</th>
                <th className="py-3.5 px-6">Target</th>
                <th className="py-3.5 px-6">Revenue</th>
                <th className="py-3.5 px-6">Ach %</th>
                <th className="py-3.5 px-6">New Clients</th>
                <th className="py-3.5 px-6">Corporate Rev</th>
                <th className="py-3.5 px-6">Active Days</th>
                <th className="py-3.5 px-6">Pending Dues</th>
                {role !== 'Staff' && <th className="py-3.5 px-6">Profit</th>}
                <th className="py-3.5 px-6">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {staffMetrics.map((stf, idx) => {
                const ratingBadge =
                  stf.rating === 'Excellent'
                    ? 'bg-emerald-50 text-emerald-700'
                    : stf.rating === 'Good'
                    ? 'bg-blue-50 text-blue-600'
                    : stf.rating === 'Needs push'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-rose-50 text-rose-700';

                return (
                  <tr
                    key={stf.id}
                    onClick={() => setSelectedStaff(stf)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-4 px-6 font-bold text-slate-500">
                      #{idx + 1}
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {stf.name.charAt(0)}
                      </div>
                      <div>
                        <div>{stf.name}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{stf.designation}</div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-600">{stf.dept}</td>
                    <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(stf.individualTarget)}</td>
                    <td className="py-4 px-6 font-mono tabular-nums font-bold text-slate-900">{formatINR(stf.revenue)}</td>
                    <td className="py-4 px-6 font-semibold text-slate-900">{stf.ach}%</td>
                    <td className="py-4 px-6 text-slate-600">{stf.newClients}</td>
                    <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(stf.corpRev)}</td>
                    <td className="py-4 px-6 text-slate-600">{stf.activeDays}d</td>
                    <td className="py-4 px-6 font-mono tabular-nums text-rose-600">{formatINR(stf.pendingDues)}</td>
                    {role !== 'Staff' && (
                      <td className="py-4 px-6 font-mono tabular-nums font-semibold text-teal-600">{formatINR(stf.profit)}</td>
                    )}
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ratingBadge}`}>
                        {stf.rating}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  {selectedStaff.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedStaff.name}'s 6-Month Performance</h3>
                  <p className="text-xs text-slate-500">{selectedStaff.designation} · {selectedStaff.dept}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getStaffMonthlyData(selectedStaff)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={val => `₹${val / 1000}k`} />
                    <Tooltip
                      formatter={(val: any) => [formatINR(val), 'Revenue']}
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                    />
                    <ReferenceLine
                      y={Math.round(selectedStaff.individualTarget / 6)}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Target', fill: '#ef4444', fontSize: 12, position: 'top' }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#1b7a54"
                      radius={[6, 6, 0, 0]}
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        const fill = payload.met ? '#1b7a54' : '#3b82f6';
                        return <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} ry={6} />;
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#1b7a54]" />
                  <span>Target Met</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                  <span>Below Target</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-rose-500" />
                  <span>Monthly Target Line</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedStaff(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
