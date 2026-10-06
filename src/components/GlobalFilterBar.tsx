import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Download, ChevronDown } from 'lucide-react';
import { exportToCSV } from '../utils/formatters';

export const GlobalFilterBar: React.FC = () => {
  const {
    filters,
    setFilters,
    clearFilters,
    staffList,
    departments,
    revenueEntries,
    outstandingPayments,
    dailyUpdates,
  } = useApp();

  const [showExportMenu, setShowExportMenu] = useState(false);

  let activeCount = 0;
  if (filters.fromDate) activeCount++;
  if (filters.toDate) activeCount++;
  if (filters.dept && filters.dept !== 'ALL') activeCount++;
  if (filters.designation && filters.designation !== 'ALL') activeCount++;
  if (filters.project && filters.project !== 'ALL') activeCount++;
  if (filters.staffId && filters.staffId !== 'ALL') activeCount++;

  const handleQuickRange = (range: 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom') => {
    const now = new Date();
    let from = '';
    let to = now.toISOString().split('T')[0];

    if (range === 'today') {
      from = to;
    } else if (range === 'last7') {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      from = d.toISOString().split('T')[0];
    } else if (range === 'thisMonth') {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (range === 'lastMonth') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      from = lastMonthDate.toISOString().split('T')[0];
      to = lastMonthEnd.toISOString().split('T')[0];
    }

    setFilters({ quickRange: range, fromDate: from, toDate: to });
  };

  const filteredStaffForDropdown = staffList.filter(s => {
    if (filters.dept && filters.dept !== 'ALL' && s.dept !== filters.dept) return false;
    if (filters.designation && filters.designation !== 'ALL' && s.designation !== filters.designation) return false;
    if (filters.project && filters.project !== 'ALL' && s.project !== filters.project) return false;
    return true;
  });

  const uniqueDesignations = Array.from(new Set(staffList.map(s => s.designation)));
  const uniqueProjects = Array.from(new Set(staffList.map(s => s.project)));

  const handleExport = (type: string) => {
    setShowExportMenu(false);
    if (type === 'dept') {
      const rows = departments.map(d => {
        const revs = revenueEntries.filter(r => r.dept === d.name);
        const rev = revs.reduce((acc, r) => acc + r.amount, 0);
        const cost = revs.reduce((acc, r) => acc + r.cost, 0);
        const profit = rev - cost;
        const ach = Math.round((rev / d.target) * 100);
        return {
          Department: d.name,
          Target: d.target,
          Revenue: rev,
          'Achievement %': `${ach}%`,
          Cost: cost,
          Profit: profit,
        };
      });
      const totalTarget = departments.reduce((acc, d) => acc + d.target, 0);
      const totalRev = rows.reduce((acc, r) => acc + r.Revenue, 0);
      const totalCost = rows.reduce((acc, r) => acc + r.Cost, 0);
      const totalProfit = rows.reduce((acc, r) => acc + r.Profit, 0);
      rows.push({
        Department: 'TOTAL' as any,
        Target: totalTarget,
        Revenue: totalRev,
        'Achievement %': `${Math.round((totalRev / totalTarget) * 100)}%`,
        Cost: totalCost,
        Profit: totalProfit,
      });
      exportToCSV('department_revenue', rows);
    } else if (type === 'staff') {
      const rows = staffList.map(stf => {
        const revs = revenueEntries.filter(r => r.staffId === stf.id);
        const rev = revs.reduce((acc, r) => acc + r.amount, 0);
        const ach = Math.round((rev / stf.individualTarget) * 100);
        const newClients = revs.filter(r => r.isNewClient).length;
        const corpRev = revs.filter(r => r.type === 'Corporate').reduce((acc, r) => acc + r.amount, 0);
        const cost = revs.reduce((acc, r) => acc + r.cost, 0);
        const profit = rev - cost;
        return {
          Staff: stf.name,
          Department: stf.dept,
          Designation: stf.designation,
          Target: stf.individualTarget,
          Revenue: rev,
          'Achievement %': `${ach}%`,
          'New Clients': newClients,
          'Corporate Revenue': corpRev,
          Profit: profit,
        };
      });
      exportToCSV('staff_performance', rows);
    } else if (type === 'directory') {
      const rows = staffList.map(s => ({
        Name: s.name,
        Department: s.dept,
        Role: s.role,
        Designation: s.designation,
        Project: s.project,
        Target: s.individualTarget,
      }));
      exportToCSV('staff_directory', rows);
    } else if (type === 'revenue') {
      const rows = revenueEntries.map(r => ({
        Date: r.date,
        Staff: r.staffName,
        Department: r.dept,
        Client: r.client,
        Type: r.type,
        Amount: r.amount,
        Cost: r.cost,
        'New Client': r.isNewClient ? 'Yes' : 'No',
        Status: r.paymentStatus,
        Received: r.amountReceived,
        'Due Date': r.dueDate || '',
      }));
      exportToCSV('revenue_entries', rows);
    } else if (type === 'outstanding') {
      const rows = outstandingPayments.map(o => ({
        Client: o.client,
        Staff: o.staffName,
        Department: o.dept,
        Amount: o.amount,
        Paid: o.amountPaid,
        Balance: o.amount - o.amountPaid,
        'Due Date': o.dueDate,
        Status: o.status,
      }));
      exportToCSV('outstanding_payments', rows);
    } else if (type === 'updates') {
      const rows = dailyUpdates.map(u => ({
        Date: u.date,
        Staff: u.staffName,
        Department: u.dept,
        'Clients Met': u.clientMetCount,
        Update: u.updateText,
      }));
      exportToCSV('daily_updates', rows);
    }
  };

  return (
    <div className="bg-white border-b border-slate-200 py-3 px-4 sm:px-6 lg:px-8 shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* From / To Dates & Quick Range Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">From</span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={e => setFilters({ fromDate: e.target.value, quickRange: 'custom' })}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none"
            />
            <span className="text-slate-500 font-medium">To</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={e => setFilters({ toDate: e.target.value, quickRange: 'custom' })}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(
              [
                { key: 'today', label: 'Today' },
                { key: 'last7', label: 'Last 7 days' },
                { key: 'thisMonth', label: 'This month' },
                { key: 'lastMonth', label: 'Last month' },
              ] as const
            ).map(btn => (
              <button
                key={btn.key}
                onClick={() => handleQuickRange(btn.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shadow-xs ${
                  filters.quickRange === btn.key
                    ? 'bg-[#1b7a54] text-white shadow-sm'
                    : 'bg-[#f4ebe1] text-slate-800 hover:bg-[#eae0d2]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cascading Dropdowns & Export */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Department */}
          <select
            value={filters.dept}
            onChange={e => setFilters({ dept: e.target.value, staffId: 'ALL' })}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">Department: All</option>
            {departments.map(d => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Designation */}
          <select
            value={filters.designation}
            onChange={e => setFilters({ designation: e.target.value, staffId: 'ALL' })}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">Designation: All</option>
            {uniqueDesignations.map(des => (
              <option key={des} value={des}>
                {des}
              </option>
            ))}
          </select>

          {/* Project */}
          <select
            value={filters.project}
            onChange={e => setFilters({ project: e.target.value, staffId: 'ALL' })}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">Project: All</option>
            {uniqueProjects.map(proj => (
              <option key={proj} value={proj}>
                {proj}
              </option>
            ))}
          </select>

          {/* Staff */}
          <select
            value={filters.staffId}
            onChange={e => setFilters({ staffId: e.target.value })}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">Staff: All</option>
            {filteredStaffForDropdown.map(stf => (
              <option key={stf.id} value={stf.id}>
                {stf.name}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear ({activeCount})</span>
            </button>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1b7a54] rounded-xl hover:bg-[#156344] transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export (Excel/CSV)</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Choose report...
                </div>
                <button
                  onClick={() => handleExport('dept')}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Department-wise revenue
                </button>
                <button
                  onClick={() => handleExport('staff')}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Staff performance
                </button>
                <button
                  onClick={() => handleExport('directory')}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Staff directory
                </button>
                <button
                  onClick={() => handleExport('revenue')}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Revenue entries
                </button>
                <button
                  onClick={() => handleExport('outstanding')}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Outstanding payments
                </button>
                <button
                  onClick={() => handleExport('updates')}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Daily updates
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
