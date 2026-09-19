/**
 * The approval ladder, built from the document itself.
 *
 * WHY THIS EXISTS
 * ---------------
 * The timeline used to draw its rungs from `GET /approvals/requests/{id}/` —
 * the generic approval engine. Payments no longer uses that engine: approvals
 * are payments' own, over the Workflow Engine, and the id the document carries
 * is now a payments flow id. The old call therefore fetched nothing, and the
 * ladder went blank for every document raised after the migration.
 *
 * The server now reports the ladder on the document's own detail response
 * (`approval.stages`), so there is nothing to fetch separately and nothing to
 * correlate by id. This turns that payload into what the screen draws.
 *
 * WHY IT IS A SEPARATE, PURE MODULE
 * ---------------------------------
 * It is the one place receipts and deposits could quietly diverge, and the one
 * place a receipt could be shown a deposit's approvers. Keeping it free of
 * React makes those cases testable directly, without rendering a screen.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It decides nothing. Stage states, who is pending and who decided each rung
 * all come from the server, which reads them from the append-only history and
 * resolves the waiting approver live. Recomputing any of that here would be a
 * second authority that can disagree with the one that enforces it.
 */
import type { DocumentApproval } from "@/src/services/payments.service";

/** The visual state of one rung. Mirrors the screen's own `StageState`. */
export type LadderState = "DONE" | "REJECTED" | "CURRENT" | "FUTURE";

export interface LadderPerson {
  name: string;
  /** Shown under the name so a stuck entry can be chased by hand. */
  username?: string;
  state: "APPROVED" | "REJECTED" | "PENDING";
}

export interface LadderRung {
  key: string;
  title: string;
  badge: string;
  state: LadderState;
  action: string;
  approvers: LadderPerson[];
  sequence: number;
  /** ISO timestamp of the decision, or undefined while it is still open. */
  decidedAt?: string;
}

/** "1st" / "2nd" / "3rd" / "4th" — the label above each rung. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Hide the username when it would only repeat the display name. */
function secondaryName(username: string, name: string): string | undefined {
  const u = (username || "").trim();
  const n = (name || "").trim();
  return u && u !== n ? u : undefined;
}

/**
 * Every rung of this document's approval, in order.
 *
 * Returns [] when the document has never been submitted, or when the server
 * sent no `stages` (a list response, or an older backend). The caller shows its
 * "not started" placeholder in that case rather than inventing rungs — the
 * ladder is configured per workflow and is not knowable from the client.
 */
export function buildLadder(
  approval: DocumentApproval | null | undefined,
): LadderRung[] {
  const stages = approval?.stages;
  if (!approval || !stages?.length) return [];

  const rejected = approval.status === "REJECTED";
  const rejectedBy = (approval.rejected_by || "").trim();

  return stages.map((stage) => {
    const decided = stage.state === "APPROVED";
    const waiting = stage.state === "CURRENT";

    // A REJECTION closes the ladder at whichever rung was holding it. The
    // server reports that rung as CURRENT — it is where the document stopped —
    // so the flow's own status is what turns it red.
    const isRejectedHere = rejected && waiting;

    const state: LadderState = isRejectedHere
      ? "REJECTED"
      : decided
        ? "DONE"
        : waiting
          ? "CURRENT"
          : "FUTURE";

    // WHO IS SHOWN depends on whether the rung has been decided. A decided
    // rung names the person who actually decided it, from history; an open one
    // names whoever must act TODAY, which the server resolves live so a
    // reassignment or a stand-in appears without an app release.
    const approvers: LadderPerson[] = decided
      ? [
          {
            name: stage.decided_by || stage.approver_name || "—",
            username: secondaryName(stage.decided_by, stage.decided_by),
            state: "APPROVED",
          },
        ]
      : isRejectedHere
        ? [
            {
              name: rejectedBy || stage.approver_name || "—",
              username: secondaryName(rejectedBy, rejectedBy),
              state: "REJECTED",
            },
          ]
        : stage.approver_name || stage.approver
          ? [
              {
                name: stage.approver_name || stage.approver,
                username: secondaryName(stage.approver, stage.approver_name),
                state: "PENDING",
              },
            ]
          : [];

    return {
      key: `stage-${stage.sequence}`,
      title: stage.name || `Stage ${stage.sequence}`,
      badge: isRejectedHere
        ? "Rejected"
        : decided
          ? "Approved"
          : waiting
            ? "Awaiting action"
            : "Pending",
      state,
      action: isRejectedHere
        ? "Rejected"
        : decided
          ? "Approved"
          : waiting
            ? "Awaiting action"
            : "Not started",
      approvers,
      sequence: stage.sequence,
      decidedAt: stage.decided_at ?? undefined,
    };
  });
}

/**
 * Does this approval payload describe the document the screen is showing?
 *
 * THE GUARD AGAINST CROSS-WIRING. Receipts and deposits are separate business
 * workflows, and several routes into this screen carry a bare numeric id — so
 * a lost or wrong `kind` parameter can land a deposit id on the receipt path.
 * The server states the workflow on every document; this compares it with what
 * the screen believes it is drawing, and the caller refuses rather than
 * rendering a deposit's approvers under a receipt's number.
 */
export function approvalMatchesKind(
  approval: DocumentApproval | null | undefined,
  kind: "RECEIPT" | "DEPOSIT",
): boolean {
  // An older backend that does not report the kind cannot be checked. Absence
  // is not a mismatch: it must not blank a working screen.
  if (!approval?.document_kind) return true;
  return approval.document_kind === kind;
}
