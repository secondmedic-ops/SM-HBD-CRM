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
  Client,
  ClientVisit,
} from '../types';
import { AccountsLogin, api, ApiMe, ClientInput, OutstandingInput, RevenueInput, StaffInput, VisitInput } from '../api';
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
  /** Incharge view: is this person the incharge or in their team? (Other views: true.) */
  inTeam: (staffId: string) => boolean;
  setCurrentStaffId: (id: string) => void;
  loading: boolean;
  notice: Notice | null;
  clearNotice: () => void;
  reload: () => Promise<void>;
  /** Departments and staff of the current view: incharge / staff views show only their own department
   *  (plus the incharge's team and a team member's incharge). The API already limits real incharge / staff logins. */
  departments: Department[];
  staffList: Staff[];
  /** Everyone the login may see, whatever the view (Admin's "View as" person picker). */
  allStaff: Staff[];
  revenueEntries: RevenueEntry[];
  outstandingPayments: OutstandingPayment[];
  dailyUpdates: DailyUpdate[];
  /** Clients in this login's scope and their visits. */
  clients: Client[];
  visits: ClientVisit[];
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
  addClient: (client: ClientInput) => Promise<Client | null>;
  updateClient: (id: string, client: ClientInput) => Promise<boolean>;
  deleteClient: (id: string) => Promise<boolean>;
  addVisit: (visit: VisitInput) => Promise<boolean>;
  updateVisit: (id: string, visit: VisitInput) => Promise<boolean>;
  deleteVisit: (id: string) => Promise<boolean>;
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
  const [clients, setClients] = useState<Client[]>([]);
  const [visits, setVisits] = useState<ClientVisit[]>([]);

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
  const loadClients = async () => {
    const [cl, vi] = await Promise.all([api.clients(), api.visits()]);
    setClients(cl);
    setVisits(vi);
  };
  const loadAccounts = async () => { if (me.role === 'ADMIN') setAccountsLogins(await api.accountsLogins()); };

  const reload = useCallback(async () => {
    try {
      const [d, s, upd] = await Promise.all([api.departments(), api.staff(), api.dailyUpdates(), loadRevenue(), loadAccounts(), loadClients()]);
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
    if ((newRole !== 'Admin' && activeTab === 'mapping') || (newRole !== 'Incharge' && activeTab === 'team')) setActiveTab('dashboard');
    // Previewing a staff / incharge view needs a person: start with the first one.
    if (newRole === 'Incharge' && !staffList.some(s => s.id === currentStaffId && s.role === 'Incharge')) {
      const firstIncharge = staffList.find(s => s.role === 'Incharge');
      if (firstIncharge) setCurrentStaffIdState(firstIncharge.id);
    } else if (newRole === 'Staff' && !currentStaffId && staffList[0]) setCurrentStaffIdState(staffList[0].id);
  };

  const setCurrentStaffId = (id: string) => {
    if (canSwitchRole) setCurrentStaffIdState(id);
  };

  // The incharge view works with a team: the incharge and everyone below them in the reporting chain
  // (an incharge may report to a senior incharge, who then sees both teams).
  const teamOf = (id: string): Set<string> => {
    const team = new Set<string>([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const s of staffList) if (s.inchargeId && team.has(s.inchargeId) && !team.has(s.id)) { team.add(s.id); grew = true; }
    }
    return team;
  };
  const viewTeam = role === 'Incharge' && currentStaffId ? teamOf(currentStaffId) : null;
  const inTeam = (staffId: string) => (viewTeam ? viewTeam.has(staffId) : true);

  // Incharge / staff views: only their own department (what the API sends such logins; this also makes Admin's
  // "View as" preview match).
  const viewed = staffList.find(s => s.id === currentStaffId);
  const ownView = (role === 'Incharge' || role === 'Staff') && !!viewed;
  const viewDepartments = ownView ? departments.filter(d => d.name === viewed!.dept) : departments;
  const viewStaff = ownView
    ? staffList.filter(s => s.dept === viewed!.dept || s.id === viewed!.id
        || (role === 'Incharge' ? inTeam(s.id) : s.id === viewed!.inchargeId))
    : staffList;

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
      // A role change can move a whole team (an incharge who becomes Team leaves their team unassigned).
      if (p.patch.role !== undefined) await loadStaff();
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
    for (const k of ['name', 'dept', 'role', 'designation', 'project', 'individualTarget', 'email', 'inchargeId'] as const) {
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

  // ---- Clients and visits ---------------------------------------------------------------------------------------------
  const addClient = async (client: ClientInput) => {
    try {
      const saved = await api.addClient(client);
      await loadClients();
      return saved;
    } catch (e) {
      fail(e);
      return null;
    }
  };
  const updateClient = (id: string, client: ClientInput) =>
    attempt(async () => { await api.updateClient(id, client); await Promise.all([loadClients(), loadRevenue()]); });
  const deleteClient = (id: string) => attempt(async () => { await api.deleteClient(id); await loadClients(); });
  const addVisit = (visit: VisitInput) => attempt(async () => { await api.addVisit(visit); await loadClients(); });
  const updateVisit = (id: string, visit: VisitInput) => attempt(async () => { await api.updateVisit(id, visit); await loadClients(); });
  const deleteVisit = (id: string) => attempt(async () => { await api.deleteVisit(id); await loadClients(); });

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
        inTeam,
        loading,
        notice,
        clearNotice: () => setNotice(null),
        reload,
        departments: viewDepartments,
        staffList: viewStaff,
        allStaff: staffList,
        revenueEntries,
        outstandingPayments,
        dailyUpdates,
        clients,
        visits,
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
        addClient,
        updateClient,
        deleteClient,
        addVisit,
        updateVisit,
        deleteVisit,
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
