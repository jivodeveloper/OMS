import { useCallback, useEffect, useRef, useState } from "react";

import paymentsService, {
  type BankAccount,
  type CollectionPerson,
  type Company,
  type CompanyOption,
  type OpenInvoice,
  type PartyOption,
} from "@/src/services/payments.service";

/** Shape the existing Dropdown component consumes. */
export interface Option {
  label: string;
  value: string;
}

interface AsyncList<T> {
  data: T[];
  loading: boolean;
  error: string;
  reload: () => void;
}

/** Turn any API failure into something worth showing a collector. */
export const messageFrom = (err: unknown, fallback = "Something went wrong"): string => {
  const anyErr = err as { response?: { status?: number; data?: any }; message?: string };
  const res = anyErr?.response;
  if (!res) return anyErr?.message || "Network error — check your connection.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (res.status === 404) return "Not found.";
  const data = res.data;
  if (typeof data === "string" && data) return data;
  if (data?.message) return data.message;
  if (data?.detail) return data.detail;
  const errors = data?.errors ?? data;
  if (errors && typeof errors === "object") {
    const first = Object.entries(errors)[0];
    if (first) {
      const [field, value] = first;
      const text = Array.isArray(value) ? String(value[0]) : String(value);
      return field === "detail" ? text : `${field}: ${text}`;
    }
  }
  return fallback;
};

/**
 * Generic async list.
 *
 * `deps` drive the cascade: parties reload when the company changes, invoices
 * when the party does. The run-id guard stops a slow earlier response from
 * overwriting a newer one — without it, switching company twice quickly can
 * leave the first company's parties on screen.
 */
function useAsyncList<T>(
  loader: () => Promise<T[]>,
  deps: unknown[],
  enabled = true,
): AsyncList<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const runId = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setError("");
      setLoading(false);
      return;
    }
    const id = ++runId.current;
    setLoading(true);
    loader()
      .then((result) => {
        if (!alive.current || id !== runId.current) return;
        setData(result);
        setError("");
      })
      .catch((err) => {
        if (!alive.current || id !== runId.current) return;
        setData([]);
        setError(messageFrom(err, "Failed to load"));
      })
      .finally(() => {
        if (!alive.current || id !== runId.current) return;
        setLoading(false);
      });
    // `loader` is an inline closure, so including it would refetch every
    // render — `deps` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** Companies the user may transact in. */
export function useCompanies() {
  const list = useAsyncList<CompanyOption>(() => paymentsService.getCompanies(), []);
  return {
    ...list,
    options: list.data.map<Option>((c) => ({
      label: c.display_name || c.company,
      value: c.company,
    })),
  };
}

/**
 * Parties for a company — empty until one is chosen.
 *
 * `withOpenInvoices` is the invoice-payment mode: only parties that actually
 * owe money. Pass false for an advance, which is not invoice-linked and can
 * legitimately come from a party with nothing outstanding. Changing the flag
 * reloads the list, because it is a different question being asked of SAP.
 */
export function useParties(
  company: Company | null,
  search = "",
  withOpenInvoices = false,
) {
  const list = useAsyncList<PartyOption>(
    () =>
      paymentsService.getParties(company as Company, search, withOpenInvoices),
    [company, search, withOpenInvoices],
    !!company,
  );
  return {
    ...list,
    // Name and code only. The user searches by either, and the amounts belong
    // on the invoice picker — a party total here would just be noise next to
    // the per-invoice figures shown at the next step.
    options: list.data.map<Option>((p) => ({
      label: p.label || `${p.card_name} (${p.card_code})`,
      value: p.card_code,
    })),
  };
}

/** Live open invoices for a party. Never cached — see the service. */
export function useOpenInvoices(company: Company | null, cardCode: string | null) {
  const list = useAsyncList<OpenInvoice>(
    () => paymentsService.getOpenInvoices(company as Company, cardCode as string),
    [company, cardCode],
    !!company && !!cardCode,
  );
  return {
    ...list,
    // The HANA columns are doc_num / doc_entry. Reading sap_doc_num here (the
    // name used in the ALLOCATION payload) silently produced "INV-undefined".
    options: list.data.map<Option>((inv) => ({
      label: `INV-${inv.doc_num} · ₹${Number(inv.balance_due).toLocaleString(
        "en-IN",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )}`,
      value: String(inv.doc_entry),
    })),
  };
}

/** "Received from" people, maintained in the admin. */
export function useCollectionPersons(company: Company | null) {
  const list = useAsyncList<CollectionPerson>(
    () => paymentsService.getCollectionPersons(company ?? undefined),
    [company],
  );
  return {
    ...list,
    options: list.data.map<Option>((p) => ({ label: p.name, value: String(p.id) })),
  };
}

/** Deposit target accounts for a company. */
export function useBankAccounts(company: Company | null) {
  const list = useAsyncList<BankAccount>(
    () => paymentsService.getBankAccounts(company ?? undefined),
    [company],
    !!company,
  );
  return {
    ...list,
    // The ACCOUNT key, not a local row id: SAP is the master and one bank can
    // hold several accounts, so the G/L is what distinguishes them.
    options: list.data.map<Option>((b) => ({
      label: b.label || b.display_name,
      value: b.key,
    })),
  };
}
