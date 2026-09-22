import React, { useMemo } from "react";
import { router } from "expo-router";

import ModuleHomeScreen, {
  type HomeBucket,
  type HomeRow,
  type ModuleHomeConfig,
} from "@/src/features/home/ModuleHomeScreen";
import { statusesForBucket, statusesParam } from "@/src/features/home/cardFilter";
import paymentsService, {
  type BankDeposit,
  type PaymentReceipt,
} from "@/src/services/payments.service";

/**
 * Home page for a payments or deposits user.
 *
 * THE LAYOUT LIVES IN `ModuleHomeScreen`, which is this file's own former
 * body, moved out and parameterised. Production and BackDate render the very
 * same component, so the four homes cannot drift into looking like different
 * products. What is left here is only what is specific to payments: which
 * documents to read, how a document becomes a row, and where tapping one goes.
 */

/** Which document this home page summarises. */
export type HomeKind = "payment" | "deposit";

/**
 * Where each document status lands.
 *
 * `rejected` deliberately covers both SAP failure states as well as an
 * approver's rejection: PENDING_ERROR means SAP refused, SAP_UNKNOWN means it
 * never answered. Neither is done, and both need somebody to look.
 */
const BUCKET_OF: Record<string, HomeBucket> = {
  DRAFT: "pending",
  PENDING_APPROVAL: "pending",
  POSTING_TO_SAP: "pending",
  APPROVED: "approved",
  POSTED: "approved",
  REJECTED: "rejected",
  PENDING_ERROR: "rejected",
  SAP_UNKNOWN: "rejected",
  // Posted, then reversed in SAP. Not "approved" — the money is no longer
  // recorded there and somebody has to decide what happens next.
  CANCELLED_IN_SAP: "rejected",
};

/**
 * The filter a card hands to the tracking list.
 *
 * DERIVED from `BUCKET_OF`, never listed again: the card's number and the
 * list's rows then come from one definition of each bucket. A hand-written
 * "rejected means REJECTED" would be wrong the moment a SAP state was added —
 * and that is exactly the bug this replaces, where a Rejected card counting
 * four SAP failures opened a list showing none of them.
 */
const filterParamsFor = (bucket: HomeBucket | "all"): Record<string, string> => {
  if (bucket === "all") return {};
  const statuses = statusesParam(statusesForBucket(BUCKET_OF, bucket));
  return statuses ? { statuses } : {};
};

/**
 * How this page reads its documents.
 *
 * `ordering` — newest first by the serial the entry was created with, the
 * same order the tracking list now asks for, so the recent list and the list
 * behind it cannot disagree.
 *
 * `page_size` — the figures on this page are counted from the documents it
 * fetches, and the endpoint paginates at 25. So the hero read "Total Payments
 * 25" with 74 receipts in the database: every card was capped at one page.
 * 200 is the server's `max_page_size`.
 *
 * THIS RAISES THE CEILING, IT DOES NOT REMOVE IT. Past 200 documents in the
 * selected month the counts under-report again, and the honest fix is a
 * totals endpoint that counts in the database rather than on the device.
 */
const LIST_PARAMS = { ordering: "-id", page_size: "200" } as const;

const money = (value: number) =>
  `₹${(Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

/**
 * Approval request ids, by receipt id.
 *
 * The approval-details screen wants the APPROVAL's id as well as the
 * document's, and a receipt that has never been submitted has none. Kept
 * beside the rows rather than on them because it is a routing detail of this
 * module, not something every module's home page has.
 */
const approvalIds = new Map<number, number | null>();

const CONFIG: Record<HomeKind, Omit<ModuleHomeConfig, "openDetail">> = {
  payment: {
    heroCount: "Total Payments",
    totalLabel: "Total Payments",
    recentTitle: "Recent Payments",
    empty: "No recent payments",
    trackingRoute: "/(main)/payments/payment-tracking",
    filterParamsFor,
    load: async (): Promise<HomeRow[]> => {
      const receipts = await paymentsService.listReceipts(LIST_PARAMS);
      approvalIds.clear();
      return receipts.map((r: PaymentReceipt) => {
        approvalIds.set(r.id, r.approval?.id ?? null);
        return {
          id: r.id,
          docNo: r.receipt_no,
          party: r.card_name || r.card_code || "—",
          right: money(Number(r.total_amount) || 0),
          date: r.payment_date || r.created_at,
          bucket: BUCKET_OF[r.status] ?? "pending",
        };
      });
    },
  },
  deposit: {
    heroCount: "Total Deposits",
    totalLabel: "Total Deposits",
    recentTitle: "Recent Deposits",
    empty: "No recent deposits",
    trackingRoute: "/(main)/payments/deposit-tracking",
    filterParamsFor,
    load: async (): Promise<HomeRow[]> => {
      const deposits = await paymentsService.listDeposits(LIST_PARAMS);
      return deposits.map((d: BankDeposit) => ({
        id: d.id,
        docNo: d.deposit_no,
        party: d.bank_account_name || "Bank deposit",
        right: money(Number(d.deposit_amount) || 0),
        date: d.deposit_date || d.created_at,
        bucket: BUCKET_OF[d.status] ?? "pending",
      }));
    },
  },
};

export default function PaymentHomeScreen({ kind }: { kind: HomeKind }) {
  const config = useMemo<ModuleHomeConfig>(
    () => ({
      ...CONFIG[kind],
      openDetail: (row: HomeRow) => {
        // Deposits have their own detail screen — see PaymentTrackingScreen.
        if (kind === "deposit") {
          router.push({
            pathname: "/(main)/payments/deposit-details",
            params: { id: String(row.id) },
          } as never);
          return;
        }
        const approvalId = approvalIds.get(row.id);
        router.push({
          pathname: "/(main)/approval/approval-details",
          params: {
            documentId: String(row.id),
            id: approvalId != null ? String(approvalId) : "",
            requestNo: row.docNo,
            // Return HERE after acting. Without it a verifier who opened a
            // payment from the home page was dropped on the tracking list
            // afterwards — a screen they never asked for. The action bar
            // itself is decided by permissions, not by this.
            from: "dashboard",
          },
        } as never);
      },
    }),
    [kind],
  );

  return <ModuleHomeScreen config={config} />;
}
