import React from 'react';
import { useApp } from '../context/AppContext';
import { Role } from '../types';
import { Calendar, Shield, Users, UserCheck, User } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    role,
    setRole,
    selectedMonth,
    setSelectedMonth,
    currentStaffId,
    setCurrentStaffId,
    allStaff: staffList,
    canSwitchRole,
    me,
    signOut,
  } = useApp();

  const roleIcons = {
    Admin: <Shield className="w-4 h-4 text-emerald-300" />,
    'Accounts team': <UserCheck className="w-4 h-4 text-blue-300" />,
    Incharge: <Users className="w-4 h-4 text-purple-300" />,
    Staff: <User className="w-4 h-4 text-amber-300" />,
  };

  return (
    <header className="bg-gradient-to-r from-[#27b07a] to-[#1f63a8] text-white shadow-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Logo & Team Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-xl shadow-inner border border-white/30">
            SM
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">SecondMedic CRM</h1>
              <span className="px-3 py-0.5 rounded-full bg-white/25 backdrop-blur-md text-xs font-semibold tracking-wide border border-white/25 shadow-sm">
                Mohan's Team
              </span>
            </div>
            <p className="text-xs text-white/80 font-medium">Healthcare Business Development Tracker</p>
          </div>
        </div>

        {/* Right: Controls (Month Picker, Role Switcher, Staff Selector if Staff) */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Picker */}
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-xs">
            <Calendar className="w-4 h-4 text-white/80" />
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            />
          </div>

          {/* Role Switcher: only an Admin can preview the other views; everyone else sees their own */}
          {canSwitchRole ? (
          <div className="flex items-center gap-1 bg-white/15 backdrop-blur-md p-1 rounded-xl border border-white/20">
            <span className="px-2 text-xs font-medium text-white/80 hidden sm:inline">View as:</span>
            {(['Admin', 'Accounts team', 'Incharge', 'Staff'] as Role[]).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  role === r
                    ? 'bg-white text-slate-900 shadow-md font-semibold'
                    : 'text-white/90 hover:bg-white/10'
                }`}
              >
                {roleIcons[r]}
                <span>{r}</span>
              </button>
            ))}
          </div>
          ) : (
            <span className="flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-xl border border-white/20 text-xs font-medium">
              {roleIcons[role]}
              <span>{role}{me.staffName ? `: ${me.staffName}` : ''}</span>
            </span>
          )}

          {/* Admin previewing a staff / incharge view: pick the person */}
          {canSwitchRole && (role === 'Staff' || role === 'Incharge') && (
            <select
              value={currentStaffId}
              onChange={e => setCurrentStaffId(e.target.value)}
              className="bg-white/20 backdrop-blur-md text-white text-xs font-medium px-3 py-2 rounded-xl border border-white/30 focus:outline-none cursor-pointer"
            >
              {staffList.map(stf => (
                <option key={stf.id} value={stf.id} className="text-slate-900">
                  {stf.name} ({stf.dept})
                </option>
              ))}
            </select>
          )}

          {me.authMode === 'supabase' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/80 hidden lg:inline">{me.email}</span>
              <button onClick={signOut} className="px-3 py-1.5 border border-white/40 text-white font-medium">
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
