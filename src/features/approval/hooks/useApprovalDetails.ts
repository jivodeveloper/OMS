import { useCallback, useEffect, useRef, useState } from "react";

import approvalsService from "@/src/services/approvals.service";
import paymentsService, {
  type PaymentReceipt,
} from "@/src/services/payments.service";
import type {
  ApprovalAttachment,
  ApprovalDecision,
  ApprovalDetail,
  ApprovalDialogStage,
  ApprovalPayment,
} from "../types";

/** How long the success dialog stays up before it closes itself. */

interface UseApprovalDetailsResult {
  /** True when the last decision completed the chain and went to SAP. */
  isFinal: boolean;
  detail: ApprovalDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  stage: ApprovalDialogStage;
  decision: ApprovalDecision;
  onRefresh: () => void;
  retry: () => void;
  /** Dismiss a non-fatal error (e.g. a SAP rejection shown in a dialog). */
  clearError: () => void;
  openApprove: () => void;
  openReject: () => void;
  closeDialog: () => void;
  /** Posts the decision, then runs loading → success. */
  submitDecision: (decision: ApprovalDecision, remarks: string) => void;
}

const money = (value: string | number | null | undefined) => {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * "CASH" -> "Cash", but "UPI" stays "UPI" — it is an initialism, and "Upi"
 * reads as a typo. These labels are also the union the UI keys its icons off.
 */
const methodLabel = (method: string) =>
  method === "UPI" ? "UPI" : method.charAt(0) + method.slice(1).toLowerCase();

/**
 * "Mixed (Cash + Cheque)" — what the payer actually handed over.
 *
 * Derived rather than stored: the method rows are the source of truth, and a
 * stored label would drift the moment one is edited.
 */
const paymentTypeLabel = (methods: PaymentReceipt["methods"]) => {
  const kinds = Array.from(new Set((methods || []).map((m) => m.method)));
  if (kinds.length === 0) return "—";
  if (kinds.length === 1) return methodLabel(kinds[0]);
  return `Mixed (${kinds.map(methodLabel).join(" + ")})`;
};

const attachmentKind = (name: string): ApprovalAttachment["kind"] =>
  name.toLowerCase().endsWith(".pdf") ? "pdf" : "image";

/**
 * Map the receipt API onto the shape this screen already renders.
 *
 * A pure function on the API response, so the screen's components stay
 * untouched — only the source of the data changed.
 */
function toApprovalDetail(receipt: PaymentReceipt): ApprovalDetail {
  const allAttachments: ApprovalAttachment[] = (receipt.attachments || []).map(
    (a) => ({
      id: String(a.id),
      name: a.original_name,
      // The API returns no byte count. Showing the attachment TYPE is honest
      // and useful; inventing a size would not be.
      size: a.type_display || "",
      kind: attachmentKind(a.original_name),
      downloadUrl: a.download_url,
    }),
  );

  /**
   * Attachments belong to a METHOD, but the API stores them per-document with
   * only a type to go on. CHEQUE_IMAGE proves a cheque line, UPI_SCREENSHOT a
   * UPI line — so they are attributed by type, and the first matching method
   * takes them. Anything unattributed (or attributed twice over) falls through
   * to the separate Attachments card.
   */
  const claimed = new Set<string>();
  const attachmentsForMethod = (method: string) => {
    const wanted =
      method === "CHEQUE"
        ? "CHEQUE_IMAGE"
        : method === "UPI"
          ? "UPI_SCREENSHOT"
          : null;
    if (!wanted) return [];
    const mine = (receipt.attachments || [])
      .filter((a) => a.attachment_type === wanted && !claimed.has(String(a.id)))
      .map((a) => String(a.id));
    mine.forEach((id) => claimed.add(id));
    return allAttachments.filter((a) => mine.includes(a.id));
  };

  const payments: ApprovalPayment[] = (receipt.methods || []).map((m) => {
    const base = {
      id: String(m.id),
      type: methodLabel(m.method) as ApprovalPayment["type"],
      amount: money(m.amount),
    };
    if (m.method === "CASH") {
      return {
        ...base,
        noteRows: (m.denominations || []).map((d) => ({
          denomination: d.denomination,
          quantity: d.quantity,
        })),
      };
    }
    if (m.method === "UPI") {
      return {
        ...base,
        upiReference: m.upi_reference || "—",
        attachments: attachmentsForMethod("UPI"),
      };
    }
    return {
      ...base,
      chequeNumber: m.cheque_number || "—",
      bankName: m.bank_name || "—",
      depositAccount: m.deposit_account
        ? {
            bankName: m.deposit_account.bank_name,
            glAccount: m.deposit_account.gl_account,
            accountNumber: m.deposit_account.account_number,
            branch: m.deposit_account.branch,
          }
        : null,
      chequeDate: formatDate(m.cheque_date),
      attachments: attachmentsForMethod("CHEQUE"),
    };
  });

  // Only what no method claimed. The card hides itself when this is empty, so
  // a proof shown inside its own payment is never repeated below it.
  const attachments = allAttachments.filter((a) => !claimed.has(a.id));

  // The invoice an approver checks the payment against. An advance has none,
  // and saying so is more useful than a blank.
  const firstAllocation = (receipt.allocations || [])[0];
  const invoice = receipt.is_advance
    ? "Advance — not invoice linked"
    : firstAllocation
      ? `INV-${firstAllocation.sap_doc_num ?? firstAllocation.sap_doc_entry}`
      : "—";

  const approvalStatus = receipt.approval?.status;

  return {
    requestNo: receipt.receipt_no,
    status: (approvalStatus === "APPROVED"
      ? "Approved"
      : approvalStatus === "REJECTED"
        ? "Rejected"
        : "Pending") as ApprovalDetail["status"],
    party: receipt.card_name || receipt.card_code,
    partyCode: receipt.card_code,
    company: receipt.company,
    createdBy: receipt.created_by_name || receipt.created_by_username || "—",
    // The login itself, shown under the name. Two people can share a display
    // name — the live data has two accounts both called "Admin" — so the
    // username is what identifies who actually acted.
    createdByUsername: receipt.created_by_username ?? "",
    createdAt: receipt.created_at ?? null,
    // Named collection person only. "PARTY" means the party paid direct, and
    // that is already on screen as the party name.
    sapBranch: receipt.sap_branch?.name
      ? receipt.sap_branch.source === "invoice"
        ? `${receipt.sap_branch.name} (Auto from Invoice)`
        : receipt.sap_branch.name
      : "",
    receivedFrom:
      receipt.received_from_type === "PERSON"
        ? receipt.received_from_name || ""
        : "",
    createdDate: formatDate(receipt.created_at),
    createdTime: formatTime(receipt.created_at),
    // The day the money actually changed hands — user-entered, and NOT the
    // same as `created_at`: cash taken on Monday may be typed up on Thursday.
    // This is what the handover span is measured from.
    collectedAt: receipt.payment_date ?? null,
    invoice,
    // What was owed when the invoice was picked. Older receipts stored 0, so
    // the card hides itself rather than showing a false "over-applied".
    invoiceAmount: Number(
      firstAllocation?.balance_at_selection ||
        firstAllocation?.invoice_total ||
        0,
    ),
    paymentType: paymentTypeLabel(receipt.methods),
    amount: money(receipt.total_amount),
    remarks: receipt.remarks || "",
    // Carried through verbatim for the SAP Information card. Note this uses
    // the RECEIPT's status, not the approval's: a receipt can be fully
    // approved and still have failed to post, and the card reports the posting.
    sap: {
      status: receipt.status,
      sap_doc_entry: receipt.sap_doc_entry ?? null,
      sap_doc_num: receipt.sap_doc_num ?? null,
      sap_trans_id: receipt.sap_trans_id ?? null,
      sap_posted_at: receipt.sap_posted_at ?? null,
      sap_response: receipt.sap_response || "",
    },
    payments,
    attachments,
    canDecide: receipt.permissions?.can_decide ?? false,
    canEdit: receipt.permissions?.can_edit ?? false,
    canResubmit: receipt.permissions?.can_resubmit ?? false,
    rejectionReason: receipt.approval?.rejection_reason ?? "",
    rejectedBy: receipt.approval?.rejected_by ?? "",
    documentId: receipt.id,
    // The handover axis, carried through so the verification view of this
    // screen can offer its actions. Read from the server on every load —
    // never inferred from the approval status, which is a different thing.
    verificationStatus: receipt.verification_status ?? null,
    verifiedBy: receipt.verified_by_name ?? "",
    verifiedByUsername: receipt.verified_by_username ?? "",
    verifiedAt: receipt.verified_at ?? null,
    verificationRemarks: receipt.verification_remarks ?? "",
    createdById: receipt.created_by ?? null,
  };
}

const messageFrom = (err: unknown) => {
  const res = (err as { response?: { status?: number; data?: any } })?.response;
  if (!res) return "Network error — check your connection.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (res.status === 404) return "This request no longer exists.";
  const data = res.data;
  if (typeof data === "string" && data) return data;
  if (data?.message) return data.message;
  if (data?.detail) return data.detail;
  const errors = data?.errors ?? data;
  if (errors && typeof errors === "object") {
    const first = Object.values(errors)[0];
    if (first) return Array.isArray(first) ? String(first[0]) : String(first);
  }
  return "Something went wrong.";
};

/**
 * Owns the details screen's data lifecycle and its approve/reject dialog
 * machine.
 *
 * Takes the RECEIPT id rather than the approval request id: the payment payload
 * carries everything this screen renders — methods, denominations, allocations,
 * attachments — while the approval request holds only workflow state. The
 * approval id is still needed to post a decision, and it arrives inside the
 * receipt as `approval.id`.
 */
export function useApprovalDetails(
  /** Human-readable number, shown immediately so the header is never blank. */
  requestNo?: string,
  /** PaymentReceipt id. Without it the screen cannot load anything. */
  documentId?: string | number,
  // NOTE: the former `onDecided` callback was removed with the auto-dismiss
  // timer. Nothing navigates on its own any more — the success dialog waits
  // for Done, and the screen's own handler does the leaving.
): UseApprovalDetailsResult {
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [approvalId, setApprovalId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ApprovalDialogStage>("none");
  /** True when the approval just taken was the LAST one — it went to SAP. */
  const [isFinal, setIsFinal] = useState(false);
  const [decision, setDecision] = useState<ApprovalDecision>("approve");

  const alive = useRef(true);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = Number(documentId);
      if (!Number.isFinite(id)) {
        // Reached without a receipt id — e.g. an old deep link, or the retired
        // Payment Requests list, whose rows never carried one. Say so plainly
        // rather than rendering an empty shell that looks like a load failure.
        setError(
          "Open this request from Payment Tracking — this link does not " +
            "identify which payment to show.",
        );
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const receipt = await paymentsService.getReceipt(id);
        if (!alive.current) return;
        setDetail(toApprovalDetail(receipt));
        setApprovalId(receipt.approval?.id ?? null);
      } catch (err) {
        if (!alive.current) return;
        setError(messageFrom(err));
        // Only an INITIAL load clears the document. A failed refresh must keep
        // whatever is already on screen — discarding it turns a transient
        // network blip into a full-screen "something went wrong" over a
        // document the user was reading perfectly well.
        if (mode === "initial") setDetail(null);
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [documentId],
  );

  useEffect(() => {
    alive.current = true;
    void load("initial");
    return () => {
      alive.current = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => void load("refresh"), [load]);
  const clearError = useCallback(() => setError(null), []);
  const retry = useCallback(() => void load("initial"), [load]);

  const openApprove = useCallback(() => {
    setDecision("approve");
    setStage("approve");
  }, []);

  const openReject = useCallback(() => {
    setDecision("reject");
    setStage("reject");
  }, []);

  const closeDialog = useCallback(() => {
    // The loading dialog is deliberately not dismissable — bail out rather than
    // letting a stray backdrop tap interrupt a decision mid-flight.
    setStage((prev) => (prev === "loading" ? prev : "none"));
  }, []);

  const submitDecision = useCallback(
    (nextDecision: ApprovalDecision, remarks: string) => {
      setDecision(nextDecision);

      if (!approvalId) {
        setStage("none");
        setError("This entry has no open approval to act on.");
        return;
      }

      setStage("loading");
      approvalsService
        .act(
          approvalId,
          nextDecision === "approve" ? "APPROVE" : "REJECT",
          remarks,
        )
        .then(async () => {
          if (!alive.current) return;

          /**
           * The approval call succeeding does NOT mean the payment posted.
           *
           * A FINAL approval triggers a synchronous SAP post, and SAP can
           * refuse it — a locked period, a bad GL. The approval genuinely
           * happened either way, but telling the approver "approved" while the
           * money never reached SAP is the wrong story: nobody chases what they
           * were told had worked.
           *
           * So the receipt is re-read before anything is shown, and its real
           * state decides the dialog.
           */
          let failure = "";
          // Was this the LAST approval? If the document left
          // PENDING_APPROVAL, the chain is complete and it went to SAP.
          let finished = false;
          try {
            const fresh = await paymentsService.getReceipt(Number(documentId));
            if (!alive.current) return;
            setDetail(toApprovalDetail(fresh));
            setApprovalId(fresh.approval?.id ?? null);
            finished = fresh.status !== "PENDING_APPROVAL";
            if (
              nextDecision === "approve" &&
              (fresh.status === "PENDING_ERROR" ||
                fresh.status === "SAP_UNKNOWN")
            ) {
              failure =
                fresh.sap_response ||
                "SAP did not accept this payment. Open it again to see why.";
            }
          } catch {
            // The re-read failed, not the decision. Fall through to the normal
            // success path rather than inventing an error.
          }

          if (failure) {
            // Not a success — show SAP's reason on the same screen, and stay
            // put so the approver can act on it.
            setStage("none");
            setError(failure);
            return;
          }

          setIsFinal(finished);
          setStage("success");
          // The dialog STAYS until the approver taps Done. It reports the
          // outcome of a real SAP posting — the document number, and whether
          // the money reached SAP — and a timer that navigates on its own can
          // whisk that away before it has been read. Leaving is the user's
          // decision; `handleDone` performs it.
        })
        .catch((err) => {
          if (!alive.current) return;
          // Back to the screen with the reason shown, rather than a success
          // dialog for something that did not happen.
          setStage("none");
          setError(messageFrom(err));
        });
    },
    [approvalId, documentId, load],
  );

  return {
    detail,
    loading,
    refreshing,
    error,
    stage,
    isFinal,
    decision,
    onRefresh,
    retry,
    clearError,
    openApprove,
    openReject,
    closeDialog,
    submitDecision,
  };
}
