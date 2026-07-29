// Dummy data for the Bank Deposit screen. UI-only — replaced by master data and
// a payments query when the backend lands, so the shapes stay close to what an
// API would plausibly return.

export type DepositPaymentMethod = "Cash" | "UPI" | "Cheque";
export type DepositStatus = "pending" | "deposited";

export interface DepositablePayment {
  id: string;
  party: string;
  invoice: string;
  date: string;
  method: DepositPaymentMethod;
  amount: number;
  status: DepositStatus;
}

export const DEPOSIT_TYPE_OPTIONS = [
  { label: "Cash", value: "cash" },
  { label: "Cheque", value: "cheque" },
  { label: "Mixed (Cash + Cheque)", value: "mixed" },
];

export const BANK_ACCOUNT_OPTIONS = [
  { label: "HDFC Bank — ****4821", value: "hdfc-4821" },
  { label: "ICICI Bank — ****9034", value: "icici-9034" },
  { label: "State Bank of India — ****2276", value: "sbi-2276" },
  { label: "Axis Bank — ****6650", value: "axis-6650" },
];

export const DEPOSITED_BY_OPTIONS = [
  { label: "Navneet", value: "navneet" },
  { label: "Goldy", value: "goldy" },
  { label: "Randeep", value: "randeep" },
  { label: "Amit", value: "amit" },
  { label: "Mahesh", value: "mahesh" },
];

export const PARTY_FILTERS = [
  { label: "All Parties", value: "all" },
  { label: "ABC Traders", value: "ABC Traders" },
  { label: "XYZ Enterprises", value: "XYZ Enterprises" },
  { label: "Om Industries", value: "Om Industries" },
  { label: "Krishna Foods", value: "Krishna Foods" },
  { label: "Mahesh Agency", value: "Mahesh Agency" },
];

/** The window the list is currently showing — drives the footer line. */
export const DEPOSIT_DATE_RANGE = {
  from: "26 Jul 2026",
  to: "28 Jul 2026",
};

/** Cash and cheque on hand, shown as balance chips above the list. */
export const AVAILABLE_BALANCE = {
  cash: 92500,
  cheque: 78000,
};

export const DEPOSITABLE_PAYMENTS: DepositablePayment[] = [
  {
    id: "pay-1",
    party: "ABC Traders",
    invoice: "INV-1001",
    date: "28 Jul 2026",
    method: "Cash",
    amount: 45000,
    status: "pending",
  },
  {
    id: "pay-2",
    party: "XYZ Enterprises",
    invoice: "INV-1002",
    date: "28 Jul 2026",
    method: "Cheque",
    amount: 62500,
    status: "pending",
  },
  {
    id: "pay-3",
    party: "Krishna Foods",
    invoice: "INV-1003",
    date: "27 Jul 2026",
    method: "Cash",
    amount: 38000,
    status: "pending",
  },
  {
    id: "pay-4",
    party: "Om Industries",
    invoice: "INV-1004",
    date: "27 Jul 2026",
    method: "UPI",
    amount: 12750,
    status: "pending",
  },
  {
    id: "pay-5",
    party: "Mahesh Agency",
    invoice: "INV-1005",
    date: "27 Jul 2026",
    method: "Cheque",
    amount: 15500,
    status: "pending",
  },
  {
    id: "pay-6",
    party: "ABC Traders",
    invoice: "INV-1006",
    date: "26 Jul 2026",
    method: "Cash",
    amount: 9500,
    status: "pending",
  },
  {
    id: "pay-7",
    party: "XYZ Enterprises",
    invoice: "INV-1007",
    date: "26 Jul 2026",
    method: "Cash",
    amount: 24000,
    status: "deposited",
  },
  {
    id: "pay-8",
    party: "Krishna Foods",
    invoice: "INV-1008",
    date: "26 Jul 2026",
    method: "Cheque",
    amount: 31200,
    status: "deposited",
  },
];
