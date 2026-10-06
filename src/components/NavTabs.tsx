import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Trophy,
  Users,
  Receipt,
  CalendarCheck,
  CreditCard,
  UserCog,
} from 'lucide-react';

export const NavTabs: React.FC = () => {
  const { activeTab, setActiveTab, role } = useApp();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'performance', label: 'Staff performance', icon: Trophy },
    { id: 'directory', label: 'Staff directory', icon: Users },
    { id: 'revenue', label: 'Revenue entries', icon: Receipt },
    { id: 'updates', label: 'Daily updates', icon: CalendarCheck },
    { id: 'outstanding', label: 'Outstanding', icon: CreditCard },
  ];

  if (role !== 'Staff') {
    tabs.push({ id: 'mapping', label: 'Staff mapping', icon: UserCog });
  }

  return (
    <div className="bg-white border-b border-slate-200 shadow-xs sticky top-[73px] z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-3">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap shrink-0 shadow-xs ${
                  isActive
                    ? 'bg-[#1b7a54] text-white shadow-md'
                    : 'bg-[#f4ebe1] text-slate-800 hover:bg-[#eae0d2]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
