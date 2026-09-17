import type {
  ProductionActionLog,
  ProductionOrder,
} from "@/src/services/production.service";

/**
 * Reused rather than redefined, so the shared approval dialogs
 * (`ApprovalLoadingDialog`, `ApproveDialog`, `RejectDialog`) type-check
 * without a cast.
 */
export type { ApprovalDecision } from "@/src/features/approval/types";

/**
 * What an order reads as on a card.
 *
 * SIX states from TWO columns, and the pairing is the point. `flow.status`
 * says what people decided; `flow.sap_status` says whether SAP took it — and
 * the two can disagree, which is exactly the case worth showing:
 *
 *   * `Completed` — approved AND the decision reached SAP. What "done" means.
 *   * `SapFailed` — every person said yes and the write-back failed. SAP is
 *     still blocking an order everyone believes is released, and only this
 *     state says so. Showing it as plain "Approved" hides the one thing that
 *     needs a human.
 *   * `Obsolete` — SAP moved the order out of Planned before anyone decided
 *     it. NOT a rejection: nobody refused anything, the question stopped
 *     being asked. Colouring it red would accuse an approver of a decision
 *     they never made.
 */
export type ProductionStatus =
  | "Pending"
  | "Approved"
  | "Completed"
  | "Rejected"
  | "SapFailed"
  | "Obsolete";

export function statusOf(order: ProductionOrder): ProductionStatus {
  const flow = order.flow;
  if (!flow) return "Pending";
  if (flow.status === "OBSOLETE") return "Obsolete";
  if (flow.status === "REJECTED") return "Rejected";
  if (flow.status === "APPROVED") {
    if (flow.sap_status === "SUCCESS") return "Completed";
    return flow.sap_status === "FAILED" ? "SapFailed" : "Approved";
  }
  return "Pending";
}

/** "Stage 2 of 3", or "" when the flow is finished or absent. */
export function stageLabel(order: ProductionOrder): string {
  return order.flow?.stage_label ?? "";
}

/**
 * Whether the SAP write-back can be re-attempted.
 *
 * Approved and failed, both. A pending order has nothing to write, and one
 * already at SUCCESS would be written twice.
 */
export function canRetrySap(order: ProductionOrder): boolean {
  const flow = order.flow;
  return flow?.status === "APPROVED" && flow.sap_status === "FAILED";
}

/* ------------------------------------------------------------------ *
 * The stage rail
 * ------------------------------------------------------------------ */

export type StageState = "DONE" | "REJECTED" | "CURRENT" | "FUTURE";

export interface StageRung {
  sequence: number;
  /** Known only for stages already acted on, or the current one. */
  name: string;
  state: StageState;
  /** The decision taken here, when one has been. */
  log: ProductionActionLog | null;
}

/**
 * The approval ladder, reconstructed.
 *
 * BackDate's history endpoint returns `{actions, stages}` and hands the client
 * a ready-made rail. PRDO's returns the action log ALONE, so the ladder is
 * derived here from three facts the API does give:
 *
 *   * `flow.total_stage` — how many rungs there are
 *   * each APPROVE/REJECT log's `stage_sequence` — which rungs were acted on
 *   * `flow.current_stage_sequence` — which rung it is sitting at
 *
 * WHAT THIS CANNOT RECOVER is the NAME of a stage nobody has reached: no
 * endpoint exposes the workflow's configuration to a viewer, so an upcoming
 * rung reads "Stage 3". That is stated rather than invented — a plausible
 * guessed name is worse than an honest number, because a reader would believe
 * it.
 */
export function buildRail(
  order: ProductionOrder,
  logs: ProductionActionLog[],
): StageRung[] {
  const flow = order.flow;
  if (!flow) return [];

  const decisions = new Map<number, ProductionActionLog>();
  for (const log of logs) {
    if (log.action !== "APPROVE" && log.action !== "REJECT") continue;
    if (log.stage_sequence == null) continue;
    // Last write wins: a stage can only be decided once per flow, but a
    // re-synced order's log is append-only and order matters.
    decisions.set(log.stage_sequence, log);
  }

  const at = flow.current_stage_sequence;
  // A flow that finished has no current stage, so the count is the only thing
  // left that says how long the ladder was.
  const total = Math.max(
    flow.total_stage || 0,
    at ?? 0,
    ...[...decisions.keys()],
  );

  const rail: StageRung[] = [];
  for (let sequence = 1; sequence <= total; sequence += 1) {
    const log = decisions.get(sequence) ?? null;
    const state: StageState = log
      ? log.action === "REJECT"
        ? "REJECTED"
        : "DONE"
      : at != null && sequence === at
        ? "CURRENT"
        : "FUTURE";

    rail.push({
      sequence,
      name:
        log?.stage_name ||
        (at != null && sequence === at ? flow.current_stage_name || "" : ""),
      state,
      log,
    });
  }
  return rail;
}
