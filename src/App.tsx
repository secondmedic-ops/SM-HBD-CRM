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

/** Grey blocks shaped like the dashboard while the first data loads. */
function ContentSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-200" />)}
      </div>
      <div className="h-8 w-1/3 bg-slate-200" />
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-slate-200" />)}
    </div>
  );
}

/** Saved / refused messages from the API (a refused save keeps the form as typed). */
function NoticeBar() {
  const { notice, clearNotice } = useApp();
  if (!notice) return null;
  const tone = notice.kind === 'error' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800';
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <div className={`flex items-start justify-between gap-4 border px-4 py-2 text-xs ${tone}`} role="status">
        <span>{notice.text}</span>
        <button onClick={clearNotice} className="underline shrink-0">Close</button>
      </div>
    </div>
  );
}

function MainContent() {
  const { activeTab, loading } = useApp();

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        <ContentSkeleton />
      </main>
    );
  }

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
        <NoticeBar />
        <MainContent />
        <footer className="py-6 text-center text-xs font-serif italic text-slate-500 tracking-wide border-t border-slate-200 mt-auto">
          ✦ Alone we do a little, together we build something big. ✦
        </footer>
      </div>
    </AppProvider>
  );
};
