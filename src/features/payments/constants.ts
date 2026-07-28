// Static option lists for the Receive Payment screen. UI-only for now — when the
// backend lands these get replaced by master-data lookups, so keep the shapes
// ({ label, value }) identical to what Dropdown already consumes.

export type PayToType = "party" | "others";
export type PaymentMethodType = "cash" | "upi" | "cheque";

// Money is coming IN on this screen, so the source is "Received From" rather
// than "Pay To" — the option values stay the same.
export const RECEIVED_FROM_OPTIONS: { label: string; value: PayToType }[] = [
  { label: "Party", value: "party" },
  { label: "Others", value: "others" },
];

// The "Party" dropdown is driven by whatever Received From is selected, so both
// lists live under the same key rather than in two separate arrays the screen
// has to branch over.
export const PARTY_OPTIONS: Record<PayToType, { label: string; value: string }[]> = {
  party: [
    { label: "ABC Traders", value: "abc-traders" },
    { label: "XYZ Enterprises", value: "xyz-enterprises" },
    { label: "Mahesh Agency", value: "mahesh-agency" },
    { label: "Krishna Foods", value: "krishna-foods" },
  ],
  others: [{ label: "Navdeep Sir", value: "navdeep-sir" }],
};

export const PAYMENT_METHOD_OPTIONS: {
  label: string;
  value: PaymentMethodType;
  icon: string;
}[] = [
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "UPI", value: "upi", icon: "phone-portrait-outline" },
  { label: "Cheque", value: "cheque", icon: "document-text-outline" },
];

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
