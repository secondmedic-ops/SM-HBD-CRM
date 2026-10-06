import React from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/formatters';
import {
  TrendingUp,
  Wallet,
  Target as TargetIcon,
  Award,
  UserPlus,
  Building2,
  DollarSign,
  Percent,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

export const DashboardTab: React.FC = () => {
  const {
    departments,
    staffList,
    revenueEntries,
    outstandingPayments,
    filters,
    selectedMonth,
    role,
    currentStaffId,
  } = useApp();

  const effectiveRevenue = revenueEntries.filter(r => {
    if (role === 'Staff' && r.staffId !== currentStaffId) return false;
    if (role === 'Incharge') {
      const inchargeStaff = staffList.find(s => s.id === currentStaffId);
      if (inchargeStaff && r.dept !== inchargeStaff.dept) return false;
    }
    if (filters.dept && filters.dept !== 'ALL' && r.dept !== filters.dept) return false;
    if (filters.staffId && filters.staffId !== 'ALL' && r.staffId !== filters.staffId) return false;
    if (filters.fromDate && r.date < filters.fromDate) return false;
    if (filters.toDate && r.date > filters.toDate) return false;
    if (!filters.fromDate && !filters.toDate && selectedMonth) {
      if (!r.date.startsWith(selectedMonth)) return false;
    }
    return true;
  });

  const totalRevenue = effectiveRevenue.reduce((acc, r) => acc + r.amount, 0);
  const totalCollected = effectiveRevenue.reduce((acc, r) => acc + r.amountReceived, 0);
  
  const effectiveDepts = role === 'Incharge'
    ? departments.filter(d => d.name === staffList.find(s => s.id === currentStaffId)?.dept)
    : filters.dept && filters.dept !== 'ALL'
    ? departments.filter(d => d.name === filters.dept)
    : departments;

  const totalTarget = effectiveDepts.reduce((acc, d) => acc + d.target, 0);
  const achievementPct = totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : 0;
  
  const newClientsCount = effectiveRevenue.filter(r => r.isNewClient).length;
  const corporateRevenue = effectiveRevenue.filter(r => r.type === 'Corporate').reduce((acc, r) => acc + r.amount, 0);
  const totalCost = effectiveRevenue.reduce((acc, r) => acc + r.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

  const totalOutstanding = outstandingPayments
    .filter(o => o.status === 'Pending')
    .filter(o => {
      if (role === 'Staff' && o.staffId !== currentStaffId) return false;
      if (role === 'Incharge') {
        const inchargeStaff = staffList.find(s => s.id === currentStaffId);
        if (inchargeStaff && o.dept !== inchargeStaff.dept) return false;
      }
      if (filters.dept && filters.dept !== 'ALL' && o.dept !== filters.dept) return false;
      if (filters.staffId && filters.staffId !== 'ALL' && o.staffId !== filters.staffId) return false;
      return true;
    })
    .reduce((acc, o) => acc + (o.amount - o.amountPaid), 0);

  const kpis = [
    { title: 'Revenue', value: formatINR(totalRevenue), icon: TrendingUp, accent: 'border-t-emerald-500', color: 'text-emerald-600' },
    { title: 'Collected', value: formatINR(totalCollected), icon: Wallet, accent: 'border-t-blue-500', color: 'text-blue-600' },
    { title: 'Target', value: formatINR(totalTarget), icon: TargetIcon, accent: 'border-t-purple-500', color: 'text-purple-600' },
    { title: 'Achievement %', value: `${achievementPct}%`, icon: Award, accent: 'border-t-amber-500', color: achievementPct >= 100 ? 'text-emerald-600' : 'text-amber-600' },
    { title: 'New clients', value: newClientsCount, icon: UserPlus, accent: 'border-t-indigo-500', color: 'text-indigo-600' },
    { title: 'Corporate revenue', value: formatINR(corporateRevenue), icon: Building2, accent: 'border-t-cyan-500', color: 'text-cyan-600' },
    ...(role !== 'Staff'
      ? [
          { title: 'Total cost', value: formatINR(totalCost), icon: DollarSign, accent: 'border-t-rose-500', color: 'text-rose-600' },
          { title: 'Profit', value: formatINR(totalProfit), icon: Briefcase, accent: 'border-t-teal-500', color: 'text-teal-600' },
          { title: 'Margin %', value: `${marginPct}%`, icon: Percent, accent: 'border-t-sky-500', color: 'text-sky-600' },
        ]
      : []),
    { title: 'Outstanding', value: formatINR(totalOutstanding), icon: AlertCircle, accent: 'border-t-red-500', color: 'text-red-600' },
  ];

  const deptRows = departments.map(d => {
    const revs = effectiveRevenue.filter(r => r.dept === d.name);
    const rev = revs.reduce((acc, r) => acc + r.amount, 0);
    const cost = revs.reduce((acc, r) => acc + r.cost, 0);
    const profit = rev - cost;
    const ach = d.target > 0 ? Math.round((rev / d.target) * 100) : 0;
    return { ...d, revenue: rev, cost, profit, achievement: ach };
  });

  const deptTotalTarget = departments.reduce((acc, d) => acc + d.target, 0);
  const deptTotalRevenue = deptRows.reduce((acc, r) => acc + r.revenue, 0);
  const deptTotalCost = deptRows.reduce((acc, r) => acc + r.cost, 0);
  const deptTotalProfit = deptTotalRevenue - deptTotalCost;

  const effectiveStaff = role === 'Staff'
    ? staffList.filter(s => s.id === currentStaffId)
    : role === 'Incharge'
    ? staffList.filter(s => s.dept === staffList.find(st => st.id === currentStaffId)?.dept)
    : filters.dept && filters.dept !== 'ALL'
    ? staffList.filter(s => s.dept === filters.dept)
    : staffList;

  const staffRows = effectiveStaff.map(stf => {
    const revs = effectiveRevenue.filter(r => r.staffId === stf.id);
    const rev = revs.reduce((acc, r) => acc + r.amount, 0);
    const cost = revs.reduce((acc, r) => acc + r.cost, 0);
    const profit = rev - cost;
    const ach = stf.individualTarget > 0 ? Math.round((rev / stf.individualTarget) * 100) : 0;
    return { ...stf, revenue: rev, cost, profit, achievement: ach };
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-200 border-t-4 ${kpi.accent} flex flex-col justify-between transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold tracking-wide uppercase">{kpi.title}</span>
                <Icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div className={`text-xl font-bold font-mono tabular-nums ${kpi.color}`}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      {role !== 'Staff' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Department-wise revenue</h3>
            <span className="text-xs text-slate-500">Target vs Actual Revenue</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-6">Department</th>
                  <th className="py-3.5 px-6">Target</th>
                  <th className="py-3.5 px-6">Revenue</th>
                  <th className="py-3.5 px-6 w-48">Progress</th>
                  <th className="py-3.5 px-6">Achievement %</th>
                  <th className="py-3.5 px-6">Cost</th>
                  <th className="py-3.5 px-6">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {deptRows.map(d => (
                  <tr key={d.name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-semibold text-slate-900">{d.name}</td>
                    <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(d.target)}</td>
                    <td className="py-4 px-6 font-mono tabular-nums font-bold text-slate-900">{formatINR(d.revenue)}</td>
                    <td className="py-4 px-6">
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full ${
                            d.achievement >= 100
                              ? 'bg-emerald-500'
                              : d.achievement >= 50
                              ? 'bg-blue-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(d.achievement, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          d.achievement >= 100
                            ? 'bg-emerald-50 text-emerald-700'
                            : d.achievement >= 50
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {d.achievement}%
                      </span>
                    </td>
                    <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(d.cost)}</td>
                    <td className="py-4 px-6 font-mono tabular-nums font-semibold text-teal-600">{formatINR(d.profit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/70 font-bold text-slate-900 border-t border-slate-200">
                  <td className="py-4 px-6">TOTAL</td>
                  <td className="py-4 px-6 font-mono tabular-nums">{formatINR(deptTotalTarget)}</td>
                  <td className="py-4 px-6 font-mono tabular-nums">{formatINR(deptTotalRevenue)}</td>
                  <td className="py-4 px-6">
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(deptTotalTarget > 0 ? Math.round((deptTotalRevenue / deptTotalTarget) * 100) : 0, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    {deptTotalTarget > 0 ? Math.round((deptTotalRevenue / deptTotalTarget) * 100) : 0}%
                  </td>
                  <td className="py-4 px-6 font-mono tabular-nums">{formatINR(deptTotalCost)}</td>
                  <td className="py-4 px-6 font-mono tabular-nums text-teal-600">{formatINR(deptTotalProfit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-[#1b7a54] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            {role === 'Staff' ? 'My performance' : 'Staff target vs revenue'}
          </h3>
          <span className="text-xs text-slate-500">Individual progress tracking</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-6">Staff Name</th>
                <th className="py-3.5 px-6">Department</th>
                <th className="py-3.5 px-6">Designation</th>
                <th className="py-3.5 px-6">Target</th>
                <th className="py-3.5 px-6">Revenue</th>
                <th className="py-3.5 px-6 w-48">Progress</th>
                <th className="py-3.5 px-6">Achievement %</th>
                {role !== 'Staff' && (
                  <>
                    <th className="py-3.5 px-6">Cost</th>
                    <th className="py-3.5 px-6">Profit</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {staffRows.map(stf => {
                const colorClass =
                  stf.achievement >= 100
                    ? 'text-emerald-600 bg-emerald-50'
                    : stf.achievement < 50
                    ? 'text-rose-600 bg-rose-50'
                    : 'text-blue-600 bg-blue-50';

                const barColor =
                  stf.achievement >= 100
                    ? 'bg-emerald-500'
                    : stf.achievement < 50
                    ? 'bg-rose-500'
                    : 'bg-blue-500';

                return (
                  <tr key={stf.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-semibold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {stf.name.charAt(0)}
                      </div>
                      <span>{stf.name}</span>
                    </td>
                    <td className="py-4 px-6 text-slate-600">{stf.dept}</td>
                    <td className="py-4 px-6 text-slate-600 text-xs">{stf.designation}</td>
                    <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(stf.individualTarget)}</td>
                    <td className="py-4 px-6 font-mono tabular-nums font-bold text-slate-900">{formatINR(stf.revenue)}</td>
                    <td className="py-4 px-6">
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${Math.min(stf.achievement, 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
                        {stf.achievement}%
                      </span>
                    </td>
                    {role !== 'Staff' && (
                      <>
                        <td className="py-4 px-6 font-mono tabular-nums text-slate-600">{formatINR(stf.cost)}</td>
                        <td className="py-4 px-6 font-mono tabular-nums font-semibold text-teal-600">{formatINR(stf.profit)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
