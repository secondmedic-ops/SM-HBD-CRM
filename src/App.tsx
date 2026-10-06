import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { GlobalFilterBar } from './components/GlobalFilterBar';
import { NavTabs } from './components/NavTabs';
import { DashboardTab } from './components/DashboardTab';
import { StaffPerformanceTab } from './components/StaffPerformanceTab';
import { StaffDirectoryTab } from './components/StaffDirectoryTab';
import { RevenueEntriesTab } from './components/RevenueEntriesTab';
import { DailyUpdatesTab } from './components/DailyUpdatesTab';
import { OutstandingTab } from './components/OutstandingTab';
import { StaffMappingTab } from './components/StaffMappingTab';

function MainContent() {
  const { activeTab } = useApp();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'performance' && <StaffPerformanceTab />}
      {activeTab === 'directory' && <StaffDirectoryTab />}
      {activeTab === 'revenue' && <RevenueEntriesTab />}
      {activeTab === 'updates' && <DailyUpdatesTab />}
      {activeTab === 'outstanding' && <OutstandingTab />}
      {activeTab === 'mapping' && <StaffMappingTab />}
    </main>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-['Poppins',sans-serif] selection:bg-[#27b07a] selection:text-white">
        <Header />
        <GlobalFilterBar />
        <NavTabs />
        <MainContent />
        <footer className="py-6 text-center text-xs font-serif italic text-slate-500 tracking-wide border-t border-slate-200 mt-auto">
          ✦ Alone we do a little, together we build something big. ✦
        </footer>
      </div>
    </AppProvider>
  );
};
