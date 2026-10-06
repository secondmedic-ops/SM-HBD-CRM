import React, { createContext, useContext, useState, useEffect } from 'react';
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
import {
  initialDepartments,
  initialStaff,
  generateSeedRevenue,
  initialOutstanding,
  initialDailyUpdates,
} from '../data/seed';
import { getTodayString } from '../utils/formatters';

interface AppContextType {
  role: Role;
  setRole: (role: Role) => void;
  currentStaffId: string;
  setCurrentStaffId: (id: string) => void;
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
  
  // Actions
  addRevenueEntry: (entry: Omit<RevenueEntry, 'id' | 'createdAt'>) => void;
  updateRevenueEntry: (id: string, entry: Partial<RevenueEntry>) => void;
  deleteRevenueEntry: (id: string) => void;
  markOutstandingReceived: (outstandingId: string, amountPaid: number) => void;
  addOutstanding: (item: Omit<OutstandingPayment, 'id' | 'createdAt' | 'status'>) => void;
  addStaff: (staff: Omit<Staff, 'id'>) => void;
  updateStaff: (id: string, staff: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  updateDepartmentTarget: (deptName: DepartmentName, target: number) => void;
  addDailyUpdate: (update: Omit<DailyUpdate, 'id' | 'createdAt'>) => void;
  accountsTeamLogins: string[];
  addAccountsLogin: (email: string) => void;
  removeAccountsLogin: (email: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRoleState] = useState<Role>(() => {
    return (localStorage.getItem('secondmedic_role') as Role) || 'Admin';
  });

  const [currentStaffId, setCurrentStaffId] = useState<string>(() => {
    return localStorage.getItem('secondmedic_current_staff') || 'stf-1';
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = localStorage.getItem('secondmedic_departments');
    return saved ? JSON.parse(saved) : initialDepartments;
  });

  const [staffList, setStaffList] = useState<Staff[]>(() => {
    const saved = localStorage.getItem('secondmedic_staff');
    return saved ? JSON.parse(saved) : initialStaff;
  });

  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>(() => {
    const saved = localStorage.getItem('secondmedic_revenue');
    return saved ? JSON.parse(saved) : generateSeedRevenue();
  });

  const [outstandingPayments, setOutstandingPayments] = useState<OutstandingPayment[]>(() => {
    const saved = localStorage.getItem('secondmedic_outstanding');
    return saved ? JSON.parse(saved) : initialOutstanding;
  });

  const [dailyUpdates, setDailyUpdates] = useState<DailyUpdate[]>(() => {
    const saved = localStorage.getItem('secondmedic_updates');
    return saved ? JSON.parse(saved) : initialDailyUpdates;
  });

  const [accountsTeamLogins, setAccountsTeamLogins] = useState<string[]>(() => {
    const saved = localStorage.getItem('secondmedic_accounts_logins');
    return saved ? JSON.parse(saved) : ['accounts@secondmedic.com', 'finance.mohan@secondmedic.com'];
  });

  const [filters, setFiltersState] = useState<FilterState>({
    fromDate: '',
    toDate: '',
    dept: 'ALL',
    designation: 'ALL',
    project: 'ALL',
    staffId: 'ALL',
    quickRange: 'thisMonth',
  });

  useEffect(() => {
    localStorage.setItem('secondmedic_role', role);
  }, [role]);

  useEffect(() => {
    localStorage.setItem('secondmedic_current_staff', currentStaffId);
  }, [currentStaffId]);

  useEffect(() => {
    localStorage.setItem('secondmedic_departments', JSON.stringify(departments));
  }, [departments]);

  useEffect(() => {
    localStorage.setItem('secondmedic_staff', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
    localStorage.setItem('secondmedic_revenue', JSON.stringify(revenueEntries));
  }, [revenueEntries]);

  useEffect(() => {
    localStorage.setItem('secondmedic_outstanding', JSON.stringify(outstandingPayments));
  }, [outstandingPayments]);

  useEffect(() => {
    localStorage.setItem('secondmedic_updates', JSON.stringify(dailyUpdates));
  }, [dailyUpdates]);

  useEffect(() => {
    localStorage.setItem('secondmedic_accounts_logins', JSON.stringify(accountsTeamLogins));
  }, [accountsTeamLogins]);

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    if (newRole === 'Staff' && activeTab === 'mapping') {
      setActiveTab('dashboard');
    }
  };

  const setFilters = (newFilters: Partial<FilterState>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFiltersState({
      fromDate: '',
      toDate: '',
      dept: 'ALL',
      designation: 'ALL',
      project: 'ALL',
      staffId: 'ALL',
      quickRange: 'thisMonth',
    });
  };

  const addRevenueEntry = (entryData: Omit<RevenueEntry, 'id' | 'createdAt'>) => {
    const id = `rev-${Date.now()}`;
    const newEntry: RevenueEntry = {
      ...entryData,
      id,
      createdAt: getTodayString(),
    };

    setRevenueEntries(prev => [newEntry, ...prev]);

    if (entryData.paymentStatus === 'Outstanding' || entryData.paymentStatus === 'Partly paid') {
      const remaining = entryData.amount - entryData.amountReceived;
      if (remaining > 0) {
        const outItem: OutstandingPayment = {
          id: `out-${Date.now()}`,
          revenueEntryId: id,
          client: entryData.client,
          staffId: entryData.staffId,
          staffName: entryData.staffName,
          dept: entryData.dept,
          amount: remaining,
          amountPaid: 0,
          dueDate: entryData.dueDate || getTodayString(),
          status: 'Pending',
          createdAt: getTodayString(),
        };
        setOutstandingPayments(prev => [outItem, ...prev]);
      }
    }
  };

  const updateRevenueEntry = (id: string, updatedFields: Partial<RevenueEntry>) => {
    setRevenueEntries(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updatedFields } : item))
    );
  };

  const deleteRevenueEntry = (id: string) => {
    setRevenueEntries(prev => prev.filter(item => item.id !== id));
    setOutstandingPayments(prev => prev.filter(item => item.revenueEntryId !== id));
  };

  const markOutstandingReceived = (outstandingId: string, amountPaid: number) => {
    setOutstandingPayments(prev =>
      prev.map(item => {
        if (item.id === outstandingId) {
          const newPaid = item.amountPaid + amountPaid;
          const isFullyPaid = newPaid >= item.amount;
          const updatedStatus = isFullyPaid ? ('Paid' as const) : ('Pending' as const);

          if (item.revenueEntryId) {
            setRevenueEntries(revs =>
              revs.map(rev => {
                if (rev.id === item.revenueEntryId) {
                  const newReceived = rev.amountReceived + amountPaid;
                  const newStatus = newReceived >= rev.amount ? 'Paid' : 'Partly paid';
                  return {
                    ...rev,
                    amountReceived: newReceived,
                    paymentStatus: newStatus,
                  };
                }
                return rev;
              })
            );
          }

          return {
            ...item,
            amountPaid: newPaid,
            status: updatedStatus,
          };
        }
        return item;
      })
    );
  };

  const addOutstanding = (itemData: Omit<OutstandingPayment, 'id' | 'createdAt' | 'status'>) => {
    const newItem: OutstandingPayment = {
      ...itemData,
      id: `out-${Date.now()}`,
      status: 'Pending',
      createdAt: getTodayString(),
    };
    setOutstandingPayments(prev => [newItem, ...prev]);
  };

  const addStaff = (staffData: Omit<Staff, 'id'>) => {
    const newStaff: Staff = {
      ...staffData,
      id: `stf-${Date.now()}`,
    };
    setStaffList(prev => [...prev, newStaff]);
  };

  const updateStaff = (id: string, updatedFields: Partial<Staff>) => {
    setStaffList(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updatedFields } : item))
    );
  };

  const deleteStaff = (id: string) => {
    setStaffList(prev => prev.filter(item => item.id !== id));
  };

  const updateDepartmentTarget = (deptName: DepartmentName, target: number) => {
    setDepartments(prev =>
      prev.map(d => (d.name === deptName ? { ...d, target } : d))
    );
  };

  const addDailyUpdate = (updateData: Omit<DailyUpdate, 'id' | 'createdAt'>) => {
    const newUpdate: DailyUpdate = {
      ...updateData,
      id: `upd-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setDailyUpdates(prev => [newUpdate, ...prev]);
  };

  const addAccountsLogin = (email: string) => {
    if (!accountsTeamLogins.includes(email)) {
      setAccountsTeamLogins(prev => [...prev, email]);
    }
  };

  const removeAccountsLogin = (email: string) => {
    setAccountsTeamLogins(prev => prev.filter(e => e !== email));
  };

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        currentStaffId,
        setCurrentStaffId,
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
        accountsTeamLogins,
        addAccountsLogin,
        removeAccountsLogin,
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

