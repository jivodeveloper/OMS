import { useCallback, useEffect, useState } from "react";

import {
  SAP_MAX_ROWS,
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type DepartmentHeadChoice,
  type PaymentPurpose,
  type SapBudget,
  type SapExpenseAccount,
  type TdsCode,
} from "@/src/services/advancePayment.service";

import type { OpenDocument, Partner } from "../logic/constants";
import {
  invoiceToDocument,
  ledgerToDocument,
  otherToDocument,
  ownerLabel,
  purchaseOrderToDocument,
  employeeToPartner,
  vendorToPartner,
  withCodePrefix,
} from "../logic/sapMapping";
import {
  PARTNER_CODE_PREFIX,
  REFERENCE_KINDS,
  availableOf,
  type PartnerSource,
  type ReferenceKind,
} from "../logic/rules";

/**
 * The live lists behind the request form: the Department's budget heads, the
 * Payment Purposes, the business partners and the documents a payment is made
 * against.
 *
 * Each list is read from the SAME endpoint the web form reads, and converted by
 * the SAME mapper (`logic/sapMapping`), so a bill's open amount here is the
 * figure the web shows and the one the server will accept.
 */

/**
 * The Payment Desk's purpose list: what the money is FOR.
 *
 * NOT per company, unlike the budget heads — a purpose is the same list
 * everywhere, so it is read once per mount and kept.
 */
export function usePurposes() {
  const [purposes, setPurposes] = useState<PaymentPurpose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    advancePaymentService
      .paymentPurposes()
      .then((found) => {
        if (alive) setPurposes(found);
      })
      .catch((err) => {
        if (alive) setError(advancePaymentError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { purposes, loading, error };
}

/**
 * Who may own a request: the employee master's HODs and Sub-HODs.
 *
 * EXACTLY the web form's list — `employeeDirectory({ roles: [1, 2] })`, roles 1
 * and 2 being HOD and Sub-HOD — and the value stored is the same `"Name (CODE)"`
 * string, because `owner_label` on the request is a label and the server keeps
 * it verbatim. Anything else here would write an owner the web could not read.
 */
export function useOwners() {
  const [owners, setOwners] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    advancePaymentService
      .employeeDirectory({ roles: [1, 2] })
      .then((rows) => {
        if (alive) {
          setOwners(rows.map((row) => ({ label: ownerLabel(row), value: ownerLabel(row) })));
        }
      })
      .catch((err) => {
        if (alive) setError(advancePaymentError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { owners, loading, error };
}

/**
 * Search the partner list a case draws on.
 *
 * SAP's supplier lookup matches code OR name and holds vendors and employee
 * imprest accounts in one table, so a search for "ORGV" also returns a VENDOR
 * whose NAME contains those letters. `withCodePrefix` is what keeps a vendor
 * picker to VENDA and an imprest picker to ORGV; it runs on whatever came
 * back, which is why the fetch asks for the server's full 500.
 */
export function usePartnerSearch(
  company: AdvancePaymentCompany | "",
  source: PartnerSource | null,
) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(
    async (term: string) => {
      if (!company || !source) {
        setPartners([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        if (source === "SAP_EMPLOYEES") {
          const rows = await advancePaymentService.employees(company, term);
          setPartners(rows.map(employeeToPartner));
        } else if (source === "SAP_CUSTOMERS") {
          // A refund's payee is a CUSTOMER (OCRD CardType C): a different
          // table from the suppliers, and no code prefix narrows it.
          const rows = await advancePaymentService.customers(company, term, SAP_MAX_ROWS);
          setPartners(rows.map(vendorToPartner));
        } else {
          const rows = await advancePaymentService.vendors(company, term, SAP_MAX_ROWS);
          setPartners(
            withCodePrefix(rows, PARTNER_CODE_PREFIX[source]).map(vendorToPartner),
          );
        }
      } catch (err) {
        setError(advancePaymentError(err));
        setPartners([]);
      } finally {
        setLoading(false);
      }
    },
    [company, source],
  );

  return { partners, loading, error, search };
}

/**
 * The chosen partner's open documents of `kind`.
 *
 * Reloads whenever the company, the kind or the partner changes, and empties
 * itself when any of them is missing — a stale list belongs to a partner the
 * requester has moved away from.
 */
export function useOpenDocuments(
  company: AdvancePaymentCompany | "",
  kind: ReferenceKind | null,
  partner: string,
) {
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const live = Boolean(kind && REFERENCE_KINDS[kind].live);

  useEffect(() => {
    if (!company || !kind || !partner || !live) {
      setDocuments([]);
      setError("");
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");

    const fetch = async (): Promise<OpenDocument[]> => {
      if (kind === "VENDOR_BILL") {
        const rows = await advancePaymentService.openVendorInvoices(company, partner);
        return rows.map((row) => invoiceToDocument(row, company));
      }
      if (kind === "VENDOR_PO") {
        const rows = await advancePaymentService.openVendorPurchaseOrders(company, partner);
        return rows.map((row) => purchaseOrderToDocument(row, company));
      }
      if (kind === "CUSTOMER_LEDGER") {
        // The customer's open items: payments received and credit memos are
        // owed to them (Cr), their invoices reduce the refund (Dr). An item
        // other OMS requests already hold in full is left out.
        const ledger = await advancePaymentService.partnerLedger(company, partner);
        return ledger.results
          .map((row) => ledgerToDocument(row, partner))
          .filter((doc): doc is OpenDocument => doc !== null && availableOf(doc) > 0);
      }
      const rows = await advancePaymentService.openOtherDocuments(company, partner);
      return rows.map((row) => otherToDocument(row, partner));
    };

    fetch()
      .then((rows) => {
        if (alive) setDocuments(rows);
      })
      .catch((err) => {
        if (!alive) return;
        setError(advancePaymentError(err));
        setDocuments([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [company, kind, partner, live]);

  return { documents, loading, error };
}

/**
 * The company's Payment Purpose choices: SAP's Budget and Sub Budget cost
 * centres.
 *
 * PER COMPANY, because a cost centre belongs to one company's SAP — a code
 * picked under OIL means nothing, or something else, under MART. `applyChange`
 * clears the two fields whenever the company changes for the same reason, so
 * this list and the chosen value can never come from different companies.
 *
 * One request per company, cached for the life of the screen: the list is
 * short, rarely changes, and re-reading it every time the form re-renders
 * would put a SAP round trip behind each keystroke.
 */
export function useBudgets(company: AdvancePaymentCompany | "") {
  const [budgets, setBudgets] = useState<SapBudget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!company) {
      setBudgets([]);
      setError("");
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .budgets(company)
      .then((rows) => {
        if (alive) setBudgets(rows);
      })
      .catch((err) => {
        if (!alive) return;
        setError(advancePaymentError(err));
        setBudgets([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company]);

  /**
   * One kind's options, with the chosen code kept on the list even when SAP no
   * longer offers it — otherwise opening an old request would silently blank
   * its purpose, and saving would drop a value nobody meant to change.
   */
  const optionsFor = useCallback(
    (kind: SapBudget["kind"], chosen: string, chosenName: string) => {
      const options = budgets
        .filter((row) => row.kind === kind)
        // A cost centre with no name (Oil's "R & D") is shown by its code.
        .map((row) => ({ label: row.name || row.code, value: row.code }));
      if (chosen && !options.some((option) => option.value === chosen)) {
        return [{ label: chosenName || chosen, value: chosen }, ...options];
      }
      return options;
    },
    [budgets],
  );

  return { budgets, optionsFor, loading, error };
}

/* ------------------------------------------------------------------ *
 * Expense
 * ------------------------------------------------------------------ */

/**
 * The company's expense G/L accounts — what an Expense line is paid to.
 *
 * DIRECT AND INDIRECT IN ONE LIST, each saying which it is: one request is one
 * kind, and the server refuses a request whose lines mix them. Showing only
 * one kind would hide the account somebody is looking for and give them no
 * reason why.
 */
export function useExpenseAccounts(company: AdvancePaymentCompany | "") {
  const [accounts, setAccounts] = useState<SapExpenseAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!company) {
      setAccounts([]);
      setError("");
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .expenseAccounts(company)
      .then((rows) => {
        if (alive) setAccounts(rows);
      })
      .catch((err) => {
        if (!alive) return;
        setError(advancePaymentError(err));
        setAccounts([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company]);

  /**
   * The picker's options, with a saved account SAP no longer lists kept on the
   * list by its saved name — otherwise opening an old request would blank a
   * line's G/L and saving would drop it.
   */
  const optionsFor = useCallback(
    (chosen: string, chosenName: string) => {
      const options = accounts.map((account) => ({
        label: `${account.code} · ${account.name}`,
        value: account.code,
        hint: `${account.kind === "DIRECT" ? "Direct" : "Indirect"} · ${account.group}`,
      }));
      if (chosen && !options.some((option) => option.value === chosen)) {
        return [{ label: `${chosen} · ${chosenName}`, value: chosen, hint: "" }, ...options];
      }
      return options;
    },
    [accounts],
  );

  const nameOf = useCallback(
    (code: string) => accounts.find((account) => account.code === code)?.name ?? "",
    [accounts],
  );

  return { accounts, optionsFor, nameOf, loading, error };
}

/** SAP's Effective Months (newest first) — which month an Expense line posts to. */
export function useExpenseMonths(company: AdvancePaymentCompany | "", enabled = true) {
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!company || !enabled) {
      setMonths([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .expenseMonths(company)
      .then((found) => {
        if (alive) setMonths(found.months ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(advancePaymentError(err));
        setMonths([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company, enabled]);

  return { months, loading, error };
}

/** SAP's TDS codes the Payment desk may deduct, the vendor's own first. */
export function useTdsCodes(company: AdvancePaymentCompany | "", cardCode: string, enabled = true) {
  const [codes, setCodes] = useState<TdsCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!company || !enabled) {
      setCodes([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .tdsOptions(company, cardCode, [])
      .then((found) => {
        if (alive) setCodes(found.codes ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(advancePaymentError(err));
        setCodes([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company, cardCode, enabled]);

  /** A code's rate, for working out a line's TDS before the server answers. */
  const rateOf = useCallback(
    (code: string) => {
      const found = codes.find((row) => row.code === code);
      return found ? Number(found.rate) : null;
    },
    [codes],
  );

  return { codes, rateOf, loading, error };
}

/**
 * The HODs a request may name as its Department Head.
 *
 * SEARCHED ON THE SERVER, because the master runs to hundreds; the chosen one
 * is kept on the list whatever the search says, so a picked head never
 * disappears while somebody types. An HOD with no OMS login cannot approve,
 * and `departmentHeadLoginError` says so rather than letting the request be
 * submitted into a stage nobody holds.
 */
export function useDepartmentHeads(search: string, enabled = true) {
  const [heads, setHeads] = useState<DepartmentHeadChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setHeads([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    // Typed searches are debounced by the caller's state; this only guards the
    // burst while a screen mounts.
    const timer = setTimeout(() => {
      advancePaymentService
        .departmentHeads(search)
        .then((found) => {
          if (alive) setHeads(found);
        })
        .catch((err) => {
          if (!alive) return;
          setError(advancePaymentError(err));
          setHeads([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, search ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, enabled]);

  return { heads, loading, error };
}
