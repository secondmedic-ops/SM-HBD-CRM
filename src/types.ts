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
  /** The client from the Clients list this entry is for (the name above is that client's name). */
  clientId?: string;
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

export type ClientStatus = 'Lead' | 'Active' | 'Inactive';
export type VisitKind = 'Visit' | 'Call' | 'Meeting' | 'Demo' | 'Email' | 'Other';

/** A client and its owner. Team members see only their own clients, an incharge the department's. */
export interface Client {
  id: string;
  name: string;
  type: RevenueType;
  category: string;
  contactPerson: string;
  phone?: string;
  email?: string;
  address: string;
  city: string;
  pincode?: string;
  status: ClientStatus;
  notes: string;
  staffId: string;
  staffName: string;
  dept: DepartmentName;
  visitCount: number;
  lastVisit?: string;
  /** Next follow-up date written on the latest visit. */
  nextFollowUp?: string;
  createdAt: string;
}

export interface ClientVisit {
  id: string;
  clientId: string;
  clientName: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  kind: VisitKind;
  purpose: string;
  notes: string;
  nextFollowUp?: string;
  createdAt: string;
}
