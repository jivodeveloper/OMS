import { useCallback, useEffect, useState } from "react";

import {
  SAP_MAX_ROWS,
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type OmsDepartment,
} from "@/src/services/advancePayment.service";

import type { OpenDocument, Partner } from "../logic/constants";
import {
  invoiceToDocument,
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
  type PartnerSource,
  type ReferenceKind,
} from "../logic/rules";

/**
 * The live lists behind the request form: departments, business partners and
 * the documents a payment is made against.
 *
 * Each list is read from the SAME endpoint the web form reads, and converted by
 * the SAME mapper (`logic/sapMapping`), so a bill's open amount here is the
 * figure the web shows and the one the server will accept.
 */

/** Active departments with their sub-departments. Loaded once per mount. */
export function useDepartments() {
  const [departments, setDepartments] = useState<OmsDepartment[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    advancePaymentService
      .departments()
      .then((rows) => {
        if (alive) setDepartments(rows);
      })
      .catch((err) => {
        if (alive) setError(advancePaymentError(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  return { departments, error };
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
