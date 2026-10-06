import { Department, Staff, RevenueEntry, OutstandingPayment, DailyUpdate } from '../types';

export const initialDepartments: Department[] = [
  { name: 'AIROLI', target: 600000 },
  { name: 'MDSA', target: 700000 },
  { name: 'CORPORATE', target: 600000 },
  { name: 'BD', target: 600000 },
  { name: 'CAMPAIGN', target: 600000 },
];

export const initialStaff: Staff[] = [
  { id: 'stf-1', name: 'Manoj', dept: 'AIROLI', role: 'Incharge', designation: 'Sr. Development Executive', project: 'AIROLI General', individualTarget: 300000 },
  { id: 'stf-2', name: 'Supriya', dept: 'AIROLI', role: 'Team', designation: 'Lab Technician – Execution', project: 'AIROLI Lab', individualTarget: 150000 },
  { id: 'stf-3', name: 'Sakshi', dept: 'AIROLI', role: 'Team', designation: 'Lab Technician – Execution', project: 'AIROLI Lab', individualTarget: 150000 },
  { id: 'stf-4', name: 'Nihal', dept: 'MDSA', role: 'Team', designation: 'Field Officer (Ranchi)', project: 'MDSA Ranchi', individualTarget: 700000 },
  { id: 'stf-5', name: 'Ranju', dept: 'CORPORATE', role: 'Incharge', designation: 'BDM', project: 'Gynoveda', individualTarget: 200000 },
  { id: 'stf-6', name: 'Mansi', dept: 'CORPORATE', role: 'Team', designation: 'BDE – Execution', project: 'Gynoveda', individualTarget: 200000 },
  { id: 'stf-7', name: 'Leena', dept: 'CORPORATE', role: 'Team', designation: 'BDE – Execution', project: 'Gynoveda', individualTarget: 200000 },
  { id: 'stf-8', name: 'Promod', dept: 'BD', role: 'Team', designation: 'BDM', project: 'BD Growth', individualTarget: 300000 },
  { id: 'stf-9', name: 'Vandana', dept: 'BD', role: 'Team', designation: 'BDE', project: 'BD Growth', individualTarget: 300000 },
  { id: 'stf-10', name: 'Mohan', dept: 'CAMPAIGN', role: 'Incharge', designation: 'BDM', project: 'SecondMedic Campaign', individualTarget: 600000 },
];

// Generate 35 realistic revenue entries across the last 6 months (Oct 2025 to Mar 2026 / current month)
const clientsList = [
  'Apollo Health Care', 'Fortis Multispeciality', 'Max Healthcare', 'Manipal Hospitals',
  'Kokilaben Dhirubhai Ambani Hospital', 'Medanta The Medcity', 'Cloudnine Hospitals',
  'Aster DM Healthcare', 'Narayana Health', 'Ruby Hall Clinic', 'Lilavati Hospital',
  'Tata Memorial Hospital', 'Wockhardt Hospitals', 'Breach Candy Hospital',
  'Hiranandani Hospital', 'SRV Hospitals', 'Zenith Hospital', 'Global Hospitals',
  'Sakra World Hospital', 'Care Hospitals', 'Yashoda Hospitals', 'Continental Hospitals',
  'Aster CMI', 'KIMS Hospitals', 'Aster Prime', 'Apollo Spectra', 'Fortis La Femme',
  'Motherhood Hospitals', 'Rainbow Childrens Hospital', 'Dr. Agarwal Eye Hospital',
  'Vasan Eye Care', 'Prashanth Hospitals', 'Billroth Hospitals', 'MIOT International',
  'Meenakshi Mission', 'Kauvery Hospital', 'Apollo BGS', 'Manipal Hebbal', 'Sankara Nethralaya'
];

export const generateSeedRevenue = (): RevenueEntry[] => {
  const entries: RevenueEntry[] = [];
  const now = new Date();
  
  for (let i = 1; i <= 38; i++) {
    const staff = initialStaff[(i * 3) % initialStaff.length];
    const daysAgo = (i * 4) % 180; // Spread across last 6 months
    const dateObj = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const dateStr = dateObj.toISOString().split('T')[0];
    
    const client = clientsList[(i * 7) % clientsList.length];
    const type = i % 2 === 0 ? 'Corporate' : 'Individual';
    const amount = Math.floor(Math.random() * 85000) + 15000;
    const cost = Math.floor(amount * (0.2 + (i % 3) * 0.1));
    const isNewClient = i % 3 === 0;
    
    const statusRand = i % 5;
    let paymentStatus: 'Paid' | 'Partly paid' | 'Outstanding' = 'Paid';
    let amountReceived = amount;
    let dueDate: string | undefined = undefined;

    if (statusRand === 0) {
      paymentStatus = 'Outstanding';
      amountReceived = 0;
      const dueObj = new Date(dateObj.getTime() + 15 * 24 * 60 * 60 * 1000);
      dueDate = dueObj.toISOString().split('T')[0];
    } else if (statusRand === 1) {
      paymentStatus = 'Partly paid';
      amountReceived = Math.floor(amount * 0.5);
      const dueObj = new Date(dateObj.getTime() + 10 * 24 * 60 * 60 * 1000);
      dueDate = dueObj.toISOString().split('T')[0];
    }

    entries.push({
      id: `rev-${i}`,
      date: dateStr,
      staffId: staff.id,
      staffName: staff.name,
      dept: staff.dept,
      client,
      type: type as any,
      amount,
      cost,
      isNewClient,
      paymentStatus,
      amountReceived,
      dueDate,
      createdAt: dateStr,
    });
  }

  return entries;
};

export const initialOutstanding: OutstandingPayment[] = [
  {
    id: 'out-1',
    revenueEntryId: 'rev-1',
    client: 'Apollo Health Care',
    staffId: 'stf-1',
    staffName: 'Manoj',
    dept: 'AIROLI',
    amount: 45000,
    amountPaid: 0,
    dueDate: '2026-04-15',
    status: 'Pending',
    createdAt: '2026-03-20',
  },
  {
    id: 'out-2',
    revenueEntryId: 'rev-6',
    client: 'Max Healthcare',
    staffId: 'stf-4',
    staffName: 'Nihal',
    dept: 'MDSA',
    amount: 72000,
    amountPaid: 36000,
    dueDate: '2026-04-20',
    status: 'Pending',
    createdAt: '2026-03-22',
  },
  {
    id: 'out-3',
    revenueEntryId: 'rev-11',
    client: 'Manipal Hospitals',
    staffId: 'stf-5',
    staffName: 'Ranju',
    dept: 'CORPORATE',
    amount: 60000,
    amountPaid: 0,
    dueDate: '2026-04-10',
    status: 'Pending',
    createdAt: '2026-03-15',
  },
  {
    id: 'out-4',
    revenueEntryId: 'rev-16',
    client: 'Kokilaben Hospital',
    staffId: 'stf-8',
    staffName: 'Promod',
    dept: 'BD',
    amount: 55000,
    amountPaid: 0,
    dueDate: '2026-04-25',
    status: 'Pending',
    createdAt: '2026-03-25',
  },
  {
    id: 'out-5',
    revenueEntryId: 'rev-22',
    client: 'Medanta The Medcity',
    staffId: 'stf-10',
    staffName: 'Mohan',
    dept: 'CAMPAIGN',
    amount: 90000,
    amountPaid: 45000,
    dueDate: '2026-04-05',
    status: 'Pending',
    createdAt: '2026-03-10',
  },
  {
    id: 'out-6',
    revenueEntryId: 'rev-28',
    client: 'Cloudnine Hospitals',
    staffId: 'stf-2',
    staffName: 'Supriya',
    dept: 'AIROLI',
    amount: 32000,
    amountPaid: 0,
    dueDate: '2026-04-18',
    status: 'Pending',
    createdAt: '2026-03-26',
  },
];

export const initialDailyUpdates: DailyUpdate[] = [
  {
    id: 'upd-1',
    date: new Date().toISOString().split('T')[0],
    staffId: 'stf-1',
    staffName: 'Manoj',
    dept: 'AIROLI',
    updateText: 'Completed lab audit and discussed corporate tie-up with Apollo branch director.',
    clientMetCount: 3,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'upd-2',
    date: new Date().toISOString().split('T')[0],
    staffId: 'stf-4',
    staffName: 'Nihal',
    dept: 'MDSA',
    updateText: 'Field visits in Ranchi district completed. 4 new diagnostic camps scheduled.',
    clientMetCount: 5,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'upd-3',
    date: new Date().toISOString().split('T')[0],
    staffId: 'stf-5',
    staffName: 'Ranju',
    dept: 'CORPORATE',
    updateText: 'Gynoveda wellness portal integration pitch presented to HR committee.',
    clientMetCount: 2,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'upd-4',
    date: new Date().toISOString().split('T')[0],
    staffId: 'stf-10',
    staffName: 'Mohan',
    dept: 'CAMPAIGN',
    updateText: 'Reviewed campaign lead conversion pipeline with regional associates.',
    clientMetCount: 4,
    createdAt: new Date().toISOString(),
  },
];
