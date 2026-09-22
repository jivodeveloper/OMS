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
