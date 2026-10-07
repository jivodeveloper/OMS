/**
 * What Production and BackDate put on the shared home page.
 *
 * The layout is `ModuleHomeScreen` — the payments home, parameterised — so
 * these two are the same page with different data in them. Only the wording,
 * the links and the row mapping live here.
 *
 * WHY THE BUCKET IS DERIVED FROM SAP FIRST, THEN THE FLOW. Both modules carry
 * two outcomes: whether the APPROVAL was decided, and whether the decision
 * then reached SAP. A request approved in OMS whose SAP write failed is not
 * done — it is the row most needing attention — so counting it as "Approved"
 * is how it stays unnoticed.
 */
import { router } from "expo-router";

import type {
  HomeBucket,
  HomeRow,
  ModuleHomeConfig,
} from "./ModuleHomeScreen";
import {
  backdateService,
  type BackDateRequest,
} from "@/src/services/backdate.service";
import {
  productionService,
  type ProductionOrder,
} from "@/src/services/production.service";
import { advancePaymentService } from "@/src/services/advancePayment.service";
import {
  creditLimitService,
  type CreditLimitRequest,
} from "@/src/services/creditLimit.service";
import { formatAmount } from "@/src/features/creditLimit/logic";
import { fromApiRequest } from "@/src/features/advancePayments/logic/requestApi";
import { requestAmount } from "@/src/features/advancePayments/logic/approvalData";
import { formatINR } from "@/src/features/advancePayments/logic/rules";

/**
 * Approval outcome -> bucket, shared by both modules.
 *
 * THE FLOW STATUS ALONE, and deliberately so. Both modules' tracking screens
 * filter on exactly this field, so bucketing on anything else makes the card's
 * number unmatchable: an approved request whose SAP write failed would be
 * counted under "Rejected" and then appear under "Approved" in the list it
 * opened. The SAP outcome is still shown on the row and on the details screen,
 * and the tracking filter has its own option for it.
 *
 * `OBSOLETE` — SAP moved a production order on before anybody decided it — is
 * none of the three. It is counted in Total only, because the tracking list
 * gives it a separate option ("No longer planned") and folding it into
 * Rejected would put rows in the card that its own link cannot show.
 */
function bucketOf(flowStatus: string | null | undefined): HomeBucket {
  switch (flowStatus) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "OBSOLETE":
      return "other";
    default:
      return "pending";
  }
}

/**
 * Both modules' buckets ARE their tracking options — one flow status each —
 * so the card sends the LABEL and the option list resolves it. That keeps the
 * dropdown showing a name the user recognises instead of a raw status.
 */
const LABEL_FOR: Record<Exclude<HomeBucket, "other">, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const filterParamsFor = (
  bucket: HomeBucket | "all",
): Record<string, string> => {
  if (bucket === "all" || bucket === "other") return {};
  return { statusLabel: LABEL_FOR[bucket] };
};

const shortDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

/* ================================================================== *
 * Production
 * ================================================================== */

export const productionHome: ModuleHomeConfig = {
  heroCount: "Total Orders",
  totalLabel: "Total Orders",
  recentTitle: "Recent Production Orders",
  empty: "No recent production orders",
  trackingRoute: "/(main)/production/tracking",
  filterParamsFor,
  load: async (): Promise<HomeRow[]> => {
    const orders = await productionService.listOrders();
    return orders.map((order: ProductionOrder) => ({
      id: order.id,
      // DocNum is the number a person quotes; DocEntry is internal and unique
      // only within a company, so it is a poor thing to show.
      docNo: order.sap_doc_num
        ? `PRDO-${order.sap_doc_num}`
        : `PRDO-${order.sap_doc_entry}`,
      party: order.item_name || order.item_code || "—",
      // PIECES, because that is what OWOR.PlannedQty means — see the service.
      right: `${Number(order.planned_qty || 0).toLocaleString("en-IN")} pcs`,
      // post_date, not created_at: "Tuesday's orders" means the day production
      // was planned for, not the day a sync happened to notice it.
      date: order.post_date || order.created_at,
      bucket: bucketOf(order.flow?.status),
    }));
  },
  openDetail: (row: HomeRow) =>
    router.push({
      pathname: "/(main)/production/tracking-details",
      params: { id: String(row.id) },
    } as never),
};

/* ================================================================== *
 * BackDate
 * ================================================================== */

export const backdateHome: ModuleHomeConfig = {
  heroCount: "Total Requests",
  totalLabel: "Total Requests",
  recentTitle: "Recent Requests",
  empty: "No recent requests",
  trackingRoute: "/(main)/backdate/tracking",
  filterParamsFor,
  load: async (): Promise<HomeRow[]> => {
    const requests = await backdateService.listRequests();
    return requests.map((request: BackDateRequest) => ({
      id: request.id,
      docNo: `BKDT-${request.id}`,
      // The SAP user being granted rights — not the OMS user who asked, which
      // is a distinction the service's own comment calls out.
      party: `${request.document_type_name} · ${request.sap_username}`,
      right: `${shortDate(request.from_date)} – ${shortDate(request.to_date)}`,
      date: request.created_at,
      bucket: bucketOf(request.flow?.status),
    }));
  },
  openDetail: (row: HomeRow) =>
    router.push({
      pathname: "/(main)/backdate/tracking-details",
      params: { id: String(row.id) },
    } as never),
};

/* ================================================================== *
 * Advance Payments
 * ================================================================== */

/**
 * The same page again, for advance payment requests.
 *
 * BOTH SCOPES, AND NEITHER IS REQUIRED. A requester may read `mine` and an
 * approver `desk`; a user holding one key is refused the other outright, and
 * `load()` has no way to know which they hold. So both are asked for and only
 * the answers that came back are used — a 403 on the scope this user does not
 * have is expected, not an error to show them.
 *
 * The desk copy wins a duplicate for the same reason it does on the list: only
 * it says the request is awaiting this user.
 */
export const advancePaymentHome: ModuleHomeConfig = {
  heroCount: "Total Requests",
  totalLabel: "Total Requests",
  recentTitle: "Recent Advance Payments",
  empty: "No recent requests",
  trackingRoute: "/(main)/advance-payments/tracking",
  // This list filters on the status itself, so the bucket is sent as it is.
  filterParamsFor: (bucket: HomeBucket | "all"): Record<string, string> => {
    if (bucket === "all" || bucket === "other") return {};
    return { status: AP_STATUS_FOR[bucket] };
  },
  load: async (): Promise<HomeRow[]> => {
    const [mine, desk] = await Promise.allSettled([
      advancePaymentService.requests("mine"),
      advancePaymentService.requests("desk"),
    ]);
    const seen = new Set<number>();
    const rows: HomeRow[] = [];
    for (const settled of [desk, mine]) {
      if (settled.status !== "fulfilled") continue;
      for (const api of settled.value) {
        if (seen.has(api.id)) continue;
        seen.add(api.id);
        const entry = fromApiRequest(api);
        rows.push({
          id: entry.serverId,
          docNo: entry.requestNo,
          party: entry.form.partnerName || entry.form.partner || "—",
          right: formatINR(requestAmount(entry.form)),
          date: entry.requestedOn,
          bucket: AP_BUCKET_FOR[entry.status],
        });
      }
    }
    return rows;
  },
  openDetail: (row: HomeRow) =>
    router.push({
      pathname: "/(main)/advance-payments/details",
      params: { id: String(row.id) },
    } as never),
};

/**
 * Where each status is counted.
 *
 * RETURNED and CANCELLED are neither approved nor rejected and are counted in
 * Total only — the same treatment `OBSOLETE` gets above, and for the same
 * reason: a card must not hold rows the list it opens cannot show.
 */
const AP_BUCKET_FOR: Record<string, HomeBucket> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  RETURNED: "other",
  CANCELLED: "other",
};

const AP_STATUS_FOR: Record<Exclude<HomeBucket, "other">, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

/* ================================================================== *
 * Credit Limit
 * ================================================================== */

/**
 * The same page again, for credit limit requests.
 *
 * ALL THREE LISTS, AND NONE OF THEM REQUIRED. `Credit_Limit` reads the
 * requests this user raised; `Credit_Limit_Approval` reads the queue waiting
 * on them and what they have already decided. A user holding one key is
 * refused the other outright and `load()` cannot know which they hold, so all
 * three are asked for and only the answers that came back are used — a 403 on
 * the side this user does not have is expected, not an error to show them.
 *
 * The QUEUE wins a duplicate, for the reason it does on the list: only it says
 * the request is awaiting this user.
 */
export const creditLimitHome: ModuleHomeConfig = {
  heroCount: "Total Requests",
  totalLabel: "Total Requests",
  recentTitle: "Recent Credit Limits",
  empty: "No recent requests",
  trackingRoute: "/(main)/credit-limit/tracking",
  // This list filters on the status itself, so the bucket is sent as it is.
  filterParamsFor: (bucket: HomeBucket | "all"): Record<string, string> => {
    if (bucket === "all" || bucket === "other") return {};
    return { status: CL_STATUS_FOR[bucket] };
  },
  load: async (): Promise<HomeRow[]> => {
    const [queue, decided, mine] = await Promise.allSettled([
      creditLimitService.approvalQueue(),
      creditLimitService.approvalHistory(),
      creditLimitService.listRequests(),
    ]);
    const seen = new Set<number>();
    const rows: HomeRow[] = [];
    for (const settled of [queue, decided, mine]) {
      if (settled.status !== "fulfilled") continue;
      for (const request of settled.value as CreditLimitRequest[]) {
        if (seen.has(request.id)) continue;
        seen.add(request.id);
        rows.push({
          id: request.id,
          docNo: `CL-${request.id}`,
          party: request.card_name || request.card_code || "—",
          // The limit being ASKED FOR, which is what the request is about —
          // the current one is a fact of the customer, not of the request.
          right: formatAmount(request.new_credit_limit),
          date: request.created_at,
          bucket: bucketOf(request.flow?.status),
        });
      }
    }
    return rows;
  },
  openDetail: (row: HomeRow) =>
    router.push({
      pathname: "/(main)/credit-limit/details",
      params: { id: String(row.id) },
    } as never),
};

const CL_STATUS_FOR: Record<Exclude<HomeBucket, "other">, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};
