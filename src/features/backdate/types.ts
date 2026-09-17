import type {
  BackDateHanaStatus,
  BackDateRequest,
} from "@/src/services/backdate.service";

/**
 * Reused rather than redefined, so the shared approval dialogs
 * (`ApprovalLoadingDialog`, `ApprovalSuccessDialog`) type-check without a cast.
 */
export type { ApprovalDecision } from "@/src/features/approval/types";

/**
 * What a request reads as on a card.
 *
 * FIVE states from TWO columns. `flow.status` says what people decided;
 * `flow.hana_status` says whether SAP actually took it — and the two can
 * disagree, which is exactly the case worth showing:
 *
 *   * `Completed` — approved AND the rights are in SAP. What "done" means.
 *   * `SapFailed` — every person said yes and SAP refused. The request is
 *     still PENDING and someone has to correct it; showing this as plain
 *     "Pending" would hide the only state that needs a human.
 */
export type BackDateStatus =
  | "Pending"
  | "Approved"
  | "Completed"
  | "Rejected"
  | "SapFailed";

export function statusOf(request: BackDateRequest): BackDateStatus {
  const flow = request.flow;
  if (!flow) return "Pending";
  if (flow.status === "REJECTED") return "Rejected";
  if (flow.status === "APPROVED") {
    return flow.hana_status === "SUCCESS" ? "Completed" : "Approved";
  }
  // Still PENDING. A FAILED SAP write here means the last approval was
  // refused by SAP and nothing was approved.
  return flow.hana_status === "FAILED" ? "SapFailed" : "Pending";
}

/** "Stage 2 of 3", or "" when the flow is finished or absent. */
export function stageLabel(request: BackDateRequest): string {
  const flow = request.flow;
  if (!flow || !flow.current_stage || !flow.current_stage_sequence) return "";
  return `Stage ${flow.current_stage_sequence} of ${flow.total_stage}`;
}

/** Whether SAP has been called at all for this request. */
export function sapAttempted(status: BackDateHanaStatus): boolean {
  return status !== null && status !== undefined;
}
