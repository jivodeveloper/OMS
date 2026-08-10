// Static option lists for the Receive Payment screen. UI-only for now — when the
// backend lands these get replaced by master-data lookups, so keep the shapes
// ({ label, value }) identical to what Dropdown already consumes.

export type PaymentMethodType = "cash" | "upi" | "cheque";

/**
 * Tenders that settle straight into a bank account.
 *
 * UPI needs no bank field on the form: an administrator maps it to a SAP house
 * bank account once and the backend resolves the G/L. Only a CHEQUE asks for a
 * bank, because the physical cheque belongs to the payer's.
 */
export const TRANSFER_METHODS: PaymentMethodType[] = ["upi"];

export const COMPANY_OPTIONS: { label: string; value: string }[] = [
  { label: "JIVO_OIL", value: "jivo-oil" },
  { label: "JIVO_BEVRAGES", value: "jivo-bevrages" },
  { label: "JIVO_MART", value: "jivo-mart" },
];

/**
 * "Party" is a sentinel rather than a person: picking it means the money came
 * straight from the trading party. Every other option is a named company user
 * who collected it on the party's behalf — either way a party is involved, so
 * the Party dropdown is always shown.
 */
export const PARTY_SOURCE = "party";

export const RECEIVED_FROM_OPTIONS: { label: string; value: string }[] = [
  { label: "Party", value: PARTY_SOURCE },
  { label: "Navneet", value: "navneet" },
  { label: "Goldy", value: "goldy" },
  { label: "Randeep", value: "randeep" },
  { label: "Amit", value: "amit" },
  { label: "Mahesh", value: "mahesh" },
  { label: "KP", value: "kp" },
  { label: "Ravneet", value: "ravneet" },
  { label: "Jagjit", value: "jagjit" },
  { label: "Sharanjit", value: "sharanjit" },
];

export const PARTY_OPTIONS: { label: string; value: string }[] = [
  { label: "ABC Traders", value: "abc-traders" },
  { label: "XYZ Enterprises", value: "xyz-enterprises" },
  { label: "Om Industries", value: "om-industries" },
  { label: "Krishna Foods", value: "krishna-foods" },
  { label: "Mahesh Agency", value: "mahesh-agency" },
];

/**
 * Dummy invoices keyed by party — the Invoice dropdown lists only the invoices
 * raised against whichever party is selected.
 */
export const INVOICES_BY_PARTY: Record<string, { label: string; value: string }[]> =
  {
    "abc-traders": [
      { label: "INV-1001", value: "inv-1001" },
      { label: "INV-1002", value: "inv-1002" },
      { label: "INV-1003", value: "inv-1003" },
    ],
    "xyz-enterprises": [
      { label: "INV-2011", value: "inv-2011" },
      { label: "INV-2012", value: "inv-2012" },
    ],
    "om-industries": [
      { label: "INV-3044", value: "inv-3044" },
      { label: "INV-3045", value: "inv-3045" },
      { label: "INV-3046", value: "inv-3046" },
    ],
    "krishna-foods": [
      { label: "INV-4102", value: "inv-4102" },
      { label: "INV-4103", value: "inv-4103" },
    ],
    "mahesh-agency": [
      { label: "INV-5220", value: "inv-5220" },
      { label: "INV-5221", value: "inv-5221" },
      { label: "INV-5222", value: "inv-5222" },
    ],
  };

/** Invoices for a party — empty until one is picked. */
export const invoicesForParty = (party: string | null) =>
  party ? (INVOICES_BY_PARTY[party] ?? []) : [];

export const PAYMENT_METHOD_OPTIONS: {
  label: string;
  value: PaymentMethodType;
  icon: string;
}[] = [
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "UPI", value: "upi", icon: "phone-portrait-outline" },
  { label: "Cheque", value: "cheque", icon: "document-text-outline" },
];

/** Matches the server rule in payments/serializers.py. */
export const UPI_REFERENCE_MAX = 50;

export const NOTE_DENOMINATIONS = [10, 20, 50, 100, 200, 500].map((value) => ({
  label: `₹${value}`,
  value,
}));

export const methodMeta = (method: PaymentMethodType) =>
  PAYMENT_METHOD_OPTIONS.find((option) => option.value === method) ??
  PAYMENT_METHOD_OPTIONS[0];

/** Indian-grouped amount for display only ("15,000"), never for input values. */
export const formatAmount = (amount: number) =>
  amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
