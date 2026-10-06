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
  /** Work email of the person's login (only sent to Admin). */
  email?: string;
  /** Admin only: a login exists for that email. */
  hasLogin?: boolean;
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
  /** The API does not send cost to team members (Staff role); the app shows 0 for them. */
  cost: number;
  isNewClient: boolean;
  paymentStatus: PaymentStatus;
  amountReceived: number;
  dueDate?: string;
  /** Id of the payment slip image (load it with api.attachment). */
  slipId?: string;
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
  /** Id of the screenshot image (load it with api.attachment). */
  screenshotId?: string;
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
