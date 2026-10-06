export type Role = 'Admin' | 'Accounts team' | 'Incharge' | 'Staff';

export type DepartmentName = 'AIROLI' | 'MDSA' | 'CORPORATE' | 'BD' | 'CAMPAIGN';

export interface Department {
  name: DepartmentName;
  target: number;
}

export interface Staff {
  id: string;
  name: string;
  dept: DepartmentName;
  role: 'Incharge' | 'Team';
  designation: string;
  project: string;
  individualTarget: number;
  email?: string;
}

export type PaymentStatus = 'Paid' | 'Partly paid' | 'Outstanding';

export type RevenueType = 'Individual' | 'Corporate';

export interface RevenueEntry {
  id: string;
  date: string; // YYYY-MM-DD
  staffId: string;
  staffName: string;
  dept: DepartmentName;
  client: string;
  type: RevenueType;
  amount: number;
  cost: number;
  isNewClient: boolean;
  paymentStatus: PaymentStatus;
  amountReceived: number;
  dueDate?: string;
  slipImage?: string; // base64 or image url
  createdAt: string;
}

export interface OutstandingPayment {
  id: string;
  revenueEntryId?: string;
  client: string;
  staffId: string;
  staffName: string;
  dept: DepartmentName;
  amount: number;
  amountPaid: number;
  dueDate: string;
  status: 'Pending' | 'Paid';
  screenshot?: string;
  createdAt: string;
}

export interface DailyUpdate {
  id: string;
  date: string; // YYYY-MM-DD
  staffId: string;
  staffName: string;
  dept: DepartmentName;
  updateText: string;
  clientMetCount: number;
  createdAt: string;
}

export interface FilterState {
  fromDate: string;
  toDate: string;
  dept: string;
  designation: string;
  project: string;
  staffId: string;
  quickRange: 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';
}
