/**
 * App state on top of the API (src/api.ts). The screens read the lists from here and call the actions; every action
 * saves through the API and then reloads what it changed, so the screens always show what the database holds.
 * What each login may see is decided by the API (own rows / own department / everything); the role here only shapes
 * the screens. An Admin can preview the other views with "View as" (it changes nothing on the server).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Role,
  DepartmentName,
  Department,
  Staff,
  RevenueEntry,
  OutstandingPayment,
  DailyUpdate,
  FilterState,
} from '../types';
import { AccountsLogin, api, ApiMe, OutstandingInput, RevenueInput, StaffInput } from '../api';
import { useAuth } from '../AuthGate';

const ROLE_VIEW: Record<NonNullable<ApiMe['role']>, Role> = {
  ADMIN: 'Admin',
  ACCOUNTS: 'Accounts team',
  INCHARGE: 'Incharge',
  STAFF: 'Staff',
};

interface Notice {
  kind: 'error' | 'ok';
  text: string;
}

interface AppContextType {
  /** The logged-in user from the API. */
  me: ApiMe;
  signOut: () => void;
  /** The view the screens show: the login's own role (an Admin may switch it to preview). */
  role: Role;
  /** Only an Admin can switch the view. */
  canSwitchRole: boolean;
  setRole: (role: Role) => void;
  /** The staff member the view is for (the login's own row; an Admin previewing may pick one). */
  currentStaffId: string;
  setCurrentStaffId: (id: string) => void;
  loading: boolean;
  notice: Notice | null;
  clearNotice: () => void;
  reload: () => Promise<void>;
  departments: Department[];
  staffList: Staff[];
  revenueEntries: RevenueEntry[];
  outstandingPayments: OutstandingPayment[];
  dailyUpdates: DailyUpdate[];
  filters: FilterState;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  clearFilters: () => void;

  // Actions: resolve true when saved, false when the API refused (the reason is shown in the notice bar).
  addRevenueEntry: (entry: RevenueInput) => Promise<boolean>;
  updateRevenueEntry: (id: string, entry: RevenueInput) => Promise<boolean>;
  deleteRevenueEntry: (id: string) => Promise<boolean>;
  markOutstandingReceived: (outstandingId: string, amountPaid: number) => Promise<boolean>;
  addOutstanding: (item: OutstandingInput) => Promise<boolean>;
  addStaff: (staff: StaffInput) => Promise<boolean>;
  /** Changes show at once and are saved shortly after typing stops. */
  updateStaff: (id: string, staff: Partial<Staff>) => void;
  deleteStaff: (id: string) => Promise<boolean>;
  updateDepartmentTarget: (deptName: DepartmentName, target: number) => Promise<boolean>;
  addDailyUpdate: (update: { date: string; staffId?: string; updateText: string; clientMetCount: number }) => Promise<boolean>;
  accountsLogins: AccountsLogin[];
  accountsTeamLogins: string[];
  addAccountsLogin: (email: string) => Promise<boolean>;
  removeAccountsLogin: (email: string) => Promise<boolean>;
  /** Admin: make a login for a staff / accounts email, or set a new password. */
  setLoginPassword: (email: string, password: string) => Promise<boolean>;
  /** A slip / screenshot image as a data URL. */
  loadImage: (id: string) => Promise<string | null>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STAFF_SAVE_DELAY = 700;

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const emptyFilters: FilterState = {
  fromDate: '',
  toDate: '',
  dept: 'ALL',
  designation: 'ALL',
  project: 'ALL',
  staffId: 'ALL',
  quickRange: 'thisMonth',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { me, signOut } = useAuth();
  const ownRole: Role = ROLE_VIEW[me.role ?? 'STAFF'];
  const canSwitchRole = me.role === 'ADMIN';

  const [role, setRoleState] = useState<Role>(ownRole);
  const [currentStaffId, setCurrentStaffIdState] = useState<string>(me.staffId ?? '');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);
  const [filters, setFiltersState] = useState<FilterState>(emptyFilters);

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([]);
  const [outstandingPayments, setOutstandingPayments] = useState<OutstandingPayment[]>([]);
  const [dailyUpdates, setDailyUpdates] = useState<DailyUpdate[]>([]);
  const [accountsLogins, setAccountsLogins] = useState<AccountsLogin[]>([]);

  const fail = (e: unknown) => setNotice({ kind: 'error', text: (e as Error)?.message || String(e) });

  /** Runs a save; shows the API's reason when it is refused. */
  const attempt = async (work: () => Promise<unknown>, ok?: string): Promise<boolean> => {
    try {
      await work();
      if (ok) setNotice({ kind: 'ok', text: ok });
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const loadRevenue = async () => {
    const [rev, out] = await Promise.all([api.revenue(), api.outstanding()]);
    // Team members get no cost from the API (they never see cost or profit).
    setRevenueEntries(rev.map(r => ({ ...r, cost: r.cost ?? 0 })));
    setOutstandingPayments(out);
  };
  const loadStaff = async () => setStaffList(await api.staff());
  const loadAccounts = async () => { if (me.role === 'ADMIN') setAccountsLogins(await api.accountsLogins()); };

  const reload = useCallback(async () => {
    try {
      const [d, s, upd] = await Promise.all([api.departments(), api.staff(), api.dailyUpdates(), loadRevenue(), loadAccounts()]);
      setDepartments(d);
      setStaffList(s);
      setDailyUpdates(upd);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.userId]);

  useEffect(() => { reload(); }, [reload]);

  const setRole = (newRole: Role) => {
    if (!canSwitchRole) return;
    setRoleState(newRole);
    if (newRole !== 'Admin' && activeTab === 'mapping') setActiveTab('dashboard');
    // Previewing a staff / incharge view needs a person: start with the first one.
    if ((newRole === 'Staff' || newRole === 'Incharge') && !currentStaffId && staffList[0]) setCurrentStaffIdState(staffList[0].id);
  };

  const setCurrentStaffId = (id: string) => {
    if (canSwitchRole) setCurrentStaffIdState(id);
  };

  const setFilters = (newFilters: Partial<FilterState>) => setFiltersState(prev => ({ ...prev, ...newFilters }));
  const clearFilters = () => setFiltersState(emptyFilters);

  // ---- Revenue and outstanding -------------------------------------------------------------------------------------
  const addRevenueEntry = (entry: RevenueInput) => attempt(async () => { await api.addRevenue(entry); await loadRevenue(); });
  const updateRevenueEntry = (id: string, entry: RevenueInput) =>
    attempt(async () => { await api.updateRevenue(id, entry); await loadRevenue(); });
  const deleteRevenueEntry = (id: string) => attempt(async () => { await api.deleteRevenue(id); await loadRevenue(); });
  const markOutstandingReceived = (outstandingId: string, amountPaid: number) =>
    attempt(async () => { await api.receiveOutstanding(outstandingId, amountPaid); await loadRevenue(); });
  const addOutstanding = (item: OutstandingInput) => attempt(async () => { await api.addOutstanding(item); await loadRevenue(); });

  // ---- Staff (inline edits are saved after a short pause, one request per row) ------------------------------------
  const pending = useRef(new Map<string, { patch: StaffInput; timer: number }>());

  const flushStaff = async (id: string) => {
    const p = pending.current.get(id);
    if (!p) return;
    pending.current.delete(id);
    try {
      const saved = await api.updateStaff(id, p.patch);
      setStaffList(prev => prev.map(s => (s.id === id ? saved : s)));
    } catch (e) {
      fail(e);
      await loadStaff().catch(() => {});
    }
  };

  const updateStaff = (id: string, fields: Partial<Staff>) => {
    setStaffList(prev => prev.map(s => (s.id === id ? { ...s, ...fields } : s)));
    const cur = pending.current.get(id);
    if (cur) window.clearTimeout(cur.timer);
    const patch: StaffInput = { ...(cur?.patch ?? {}) };
    for (const k of ['name', 'dept', 'role', 'designation', 'project', 'individualTarget', 'email'] as const) {
      if (fields[k] !== undefined) (patch as any)[k] = fields[k];
    }
    // A name being retyped is not sent while the box is empty.
    const timer = window.setTimeout(() => {
      const p = pending.current.get(id);
      if (p && p.patch.name !== undefined && !p.patch.name.trim()) return;
      // An email still being typed is not sent until it looks complete ('' unlinks the login).
      if (p && p.patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.patch.email.trim())) return;
      flushStaff(id);
    }, STAFF_SAVE_DELAY);
    pending.current.set(id, { patch, timer });
  };

  const addStaff = (staff: StaffInput) => attempt(async () => { await api.addStaff(staff); await loadStaff(); });
  const deleteStaff = (id: string) => attempt(async () => { await api.deleteStaff(id); await loadStaff(); });

  const updateDepartmentTarget = (deptName: DepartmentName, target: number) =>
    attempt(async () => {
      const d = await api.setDepartmentTarget(deptName, target);
      setDepartments(prev => prev.map(x => (x.name === d.name ? { ...x, target: d.target } : x)));
    });

  // ---- Daily updates ------------------------------------------------------------------------------------------------
  const addDailyUpdate = (update: { date: string; staffId?: string; updateText: string; clientMetCount: number }) =>
    attempt(async () => { await api.addDailyUpdate(update); setDailyUpdates(await api.dailyUpdates()); });

  // ---- Accounts team and logins (Admin) -------------------------------------------------------------------------------
  const addAccountsLogin = (email: string) => attempt(async () => { await api.addAccountsLogin(email); await loadAccounts(); });
  const removeAccountsLogin = (email: string) => attempt(async () => { await api.removeAccountsLogin(email); await loadAccounts(); });
  const setLoginPassword = (email: string, password: string) =>
    attempt(async () => {
      const r = await api.setLogin(email, password);
      setNotice({ kind: 'ok', text: r.created ? `Login created for ${r.email}.` : `New password saved for ${r.email}.` });
      await Promise.all([loadStaff(), loadAccounts()]);
    });

  const loadImage = async (id: string) => {
    try {
      return (await api.attachment(id)).dataUrl;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  return (
    <AppContext.Provider
      value={{
        me,
        signOut,
        role,
        canSwitchRole,
        setRole,
        currentStaffId,
        setCurrentStaffId,
        loading,
        notice,
        clearNotice: () => setNotice(null),
        reload,
        departments,
        staffList,
        revenueEntries,
        outstandingPayments,
        dailyUpdates,
        filters,
        selectedMonth,
        setSelectedMonth,
        setFilters,
        clearFilters,
        addRevenueEntry,
        updateRevenueEntry,
        deleteRevenueEntry,
        markOutstandingReceived,
        addOutstanding,
        addStaff,
        updateStaff,
        deleteStaff,
        updateDepartmentTarget,
        addDailyUpdate,
        accountsLogins,
        accountsTeamLogins: accountsLogins.map(a => a.email),
        addAccountsLogin,
        removeAccountsLogin,
        setLoginPassword,
        loadImage,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
