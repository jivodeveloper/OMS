import { useCallback, useEffect, useState } from "react";

import {
  advancePaymentError,
  advancePaymentService,
  type ApiAssignment,
} from "@/src/services/advancePayment.service";

import { EMPTY_FORM, applyChange, availableOf, type RequestForm } from "./logic/rules";
import { invoiceToDocument, purchaseOrderToDocument } from "./logic/sapMapping";

/**
 * Bills and POs sent to this user, and the request form filled from one.
 *
 * `formFromAssignment` is PORTED FROM THE WEB CLIENT
 * (`OMS-Frontend/src/pages/advancePayments/assignments.ts`) and must stay the
 * same: the form it builds is the payload the server then validates, and the
 * two clients may not fill it differently. The hook around it is the app's own
 * — the web uses react-query, this app reads on focus.
 */

/**
 * The request form, filled from the assigned document AS SAP HAS IT NOW:
 * company, Vendor, Against Bill / PO, the vendor and the document. The amount
 * and the rest are the requester's.
 *
 * Throws a SENTENCE, not a code: the document may have been paid, closed or
 * taken by another OMS request between being sent and being opened, and the
 * person who opened it is the one who has to be told which.
 */
export async function formFromAssignment(assignment: ApiAssignment): Promise<RequestForm> {
  const label = `${assignment.kind === "BILL" ? "Bill" : "PO"} ${assignment.sap_doc_num}`;
  const documents =
    assignment.kind === "BILL"
      ? (
          await advancePaymentService.openVendorInvoices(assignment.company, assignment.card_code)
        ).map((row) => invoiceToDocument(row, assignment.company))
      : (
          await advancePaymentService.openVendorPurchaseOrders(
            assignment.company,
            assignment.card_code,
          )
        ).map((row) => purchaseOrderToDocument(row, assignment.company));

  const prefix = assignment.kind === "BILL" ? "PCH" : "POR";
  const document = documents.find((row) => row.id === `${prefix}-${assignment.sap_doc_entry}`);
  if (!document) {
    throw new Error(
      `${label} is no longer open in SAP, or other OMS requests already hold all of it.`,
    );
  }
  if (availableOf(document) <= 0) {
    throw new Error(`Other OMS requests already hold all of ${label}.`);
  }

  // Through the form's own change rules, answer by answer, as a person picking
  // them would: each step sets up what the next depends on (the document's
  // payment line among them).
  const steps: Partial<RequestForm>[] = [
    { company: assignment.company, type: "VENDOR" },
    { paymentAgainst: assignment.kind === "BILL" ? "AGAINST_BILL" : "AGAINST_PO" },
    { partner: assignment.card_code, partnerName: assignment.card_name },
    { selected: [document] },
  ];
  return steps.reduce<RequestForm>((form, patch) => applyChange(form, patch), EMPTY_FORM);
}

/**
 * The assignments on one side of the fence, re-read on demand.
 *
 * `mine` is what was sent to me and is still waiting; `sent` is everything I
 * sent, whatever became of it, which is the only way to see that a recipient
 * dismissed one.
 */
export function useAssignments(scope: "mine" | "sent", status?: ApiAssignment["status"]) {
  const [rows, setRows] = useState<ApiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await advancePaymentService.assignments(scope, status));
    } catch (err) {
      setError(advancePaymentError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload: load };
}

/** What has become of one sent document, in the words the two pages use. */
export const ASSIGNMENT_STATUS: Record<
  ApiAssignment["status"],
  { label: string; tone: "hold" | "ok" | "neutral" }
> = {
  OPEN: { label: "Waiting", tone: "hold" },
  RAISED: { label: "Request raised", tone: "ok" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};
