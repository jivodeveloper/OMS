/**
 * The approval ladder, and the line between the receipt and deposit workflows.
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping —
 * no jest, no vitest, no babel, nothing added to the dependency tree:
 *
 *     npm test
 *
 * That is possible because `approvalLadder.ts` is pure and its only import is
 * `import type`, which type-stripping erases. Keeping the ladder free of React
 * is what makes the cross-wiring cases below testable at all: they are about
 * data, and rendering a screen to assert them would prove less and break more.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approvalMatchesKind,
  buildLadder,
  ordinal,
  type LadderRung,
} from "./approvalLadder.ts";

type Approval = Parameters<typeof buildLadder>[0];

function stage(over: Record<string, unknown> = {}) {
  return {
    sequence: 1,
    name: "Stage 1",
    state: "PENDING" as const,
    approver: "navdeep",
    approver_name: "Navdeep Singh",
    decided_by: "",
    decided_at: null,
    ...over,
  };
}

function approval(over: Record<string, unknown> = {}): Approval {
  return {
    id: 1,
    status: "PENDING",
    document_kind: "RECEIPT",
    current_stage: 10,
    current_stage_sequence: 1,
    total_stage: 1,
    stage_label: "Stage 1 of 1",
    stages: [stage()],
    ...over,
  } as Approval;
}

describe("buildLadder", () => {
  it("returns nothing when the document was never submitted", () => {
    assert.deepEqual(buildLadder(null), []);
    assert.deepEqual(buildLadder(undefined), []);
  });

  it("returns nothing when the server sent no stages", () => {
    // A LIST response, or an older backend. The caller shows its own
    // "not started" placeholder rather than inventing rungs.
    assert.deepEqual(buildLadder(approval({ stages: undefined })), []);
    assert.deepEqual(buildLadder(approval({ stages: [] })), []);
  });

  it("maps each server state to its visual state", () => {
    const rungs = buildLadder(
      approval({
        stages: [
          stage({ sequence: 1, state: "APPROVED", decided_by: "asha" }),
          stage({ sequence: 2, state: "CURRENT" }),
          stage({ sequence: 3, state: "PENDING" }),
        ],
        total_stage: 3,
      }),
    );

    assert.deepEqual(
      rungs.map((r: LadderRung) => r.state),
      ["DONE", "CURRENT", "FUTURE"],
    );
    assert.deepEqual(
      rungs.map((r: LadderRung) => r.badge),
      ["Approved", "Awaiting action", "Pending"],
    );
  });

  it("names the person who decided a rung, not the one assigned to it", () => {
    // The assignee can change after the fact — a reassignment, a stand-in —
    // and the history is what records who actually approved.
    const [rung] = buildLadder(
      approval({
        stages: [
          stage({
            state: "APPROVED",
            approver: "someone_else",
            approver_name: "Someone Else",
            decided_by: "asha",
          }),
        ],
      }),
    );

    assert.equal(rung.approvers[0].name, "asha");
    assert.equal(rung.approvers[0].state, "APPROVED");
  });

  it("names the live approver on a rung still waiting", () => {
    const [rung] = buildLadder(approval({ stages: [stage({ state: "CURRENT" })] }));

    assert.equal(rung.approvers[0].name, "Navdeep Singh");
    assert.equal(rung.approvers[0].username, "navdeep");
    assert.equal(rung.approvers[0].state, "PENDING");
  });

  it("turns the holding rung red when the document was rejected", () => {
    const [rung] = buildLadder(
      approval({
        status: "REJECTED",
        rejected_by: "asha",
        stages: [stage({ state: "CURRENT" })],
      }),
    );

    assert.equal(rung.state, "REJECTED");
    assert.equal(rung.badge, "Rejected");
    assert.equal(rung.approvers[0].name, "asha");
    assert.equal(rung.approvers[0].state, "REJECTED");
  });

  it("leaves already-approved rungs green when a later one is rejected", () => {
    // The earlier approval genuinely happened and must not be rewritten by
    // what came after it.
    const rungs = buildLadder(
      approval({
        status: "REJECTED",
        rejected_by: "asha",
        stages: [
          stage({ sequence: 1, state: "APPROVED", decided_by: "ravi" }),
          stage({ sequence: 2, state: "CURRENT" }),
        ],
        total_stage: 2,
      }),
    );

    assert.equal(rungs[0].state, "DONE");
    assert.equal(rungs[0].approvers[0].name, "ravi");
    assert.equal(rungs[1].state, "REJECTED");
  });

  it("hides the username when it would only repeat the name", () => {
    const [rung] = buildLadder(
      approval({
        stages: [
          stage({ state: "CURRENT", approver: "navdeep", approver_name: "navdeep" }),
        ],
      }),
    );
    assert.equal(rung.approvers[0].username, undefined);
  });

  it("falls back to a stage number when the stage has no name", () => {
    const [rung] = buildLadder(
      approval({ stages: [stage({ sequence: 4, name: "" })] }),
    );
    assert.equal(rung.title, "Stage 4");
  });

  it("carries the decision timestamp through", () => {
    const [rung] = buildLadder(
      approval({
        stages: [
          stage({ state: "APPROVED", decided_by: "asha", decided_at: "2026-09-13T10:00:00Z" }),
        ],
      }),
    );
    assert.equal(rung.decidedAt, "2026-09-13T10:00:00Z");
  });
});

describe("receipt / deposit isolation", () => {
  it("accepts an approval that belongs to the workflow being shown", () => {
    assert.equal(
      approvalMatchesKind(approval({ document_kind: "RECEIPT" }), "RECEIPT"),
      true,
    );
    assert.equal(
      approvalMatchesKind(approval({ document_kind: "DEPOSIT" }), "DEPOSIT"),
      true,
    );
  });

  it("refuses a DEPOSIT approval on the receipt path", () => {
    // The case the guard exists for: several routes carry a bare numeric id,
    // and receipt 7 and deposit 7 both exist. Drawing this anyway would show a
    // deposit's approvers under a receipt's number.
    assert.equal(
      approvalMatchesKind(approval({ document_kind: "DEPOSIT" }), "RECEIPT"),
      false,
    );
  });

  it("refuses a RECEIPT approval on the deposit path", () => {
    assert.equal(
      approvalMatchesKind(approval({ document_kind: "RECEIPT" }), "DEPOSIT"),
      false,
    );
  });

  it("tolerates a server that does not state the workflow", () => {
    // Absence is not a mismatch: an older backend must not blank a screen
    // that works.
    assert.equal(approvalMatchesKind(approval({ document_kind: undefined }), "RECEIPT"), true);
    assert.equal(approvalMatchesKind(null, "DEPOSIT"), true);
  });

  it("does not decide the workflow from the document number", () => {
    // Routing is the server's statement, not a prefix convention. A deposit
    // numbered like a receipt is still a deposit.
    assert.equal(
      approvalMatchesKind(approval({ document_kind: "DEPOSIT" }), "RECEIPT"),
      false,
    );
  });
});

describe("ordinal", () => {
  it("labels the common cases", () => {
    assert.deepEqual([1, 2, 3, 4].map(ordinal), ["1st", "2nd", "3rd", "4th"]);
  });

  it("handles the teens, which do not follow the rule", () => {
    assert.deepEqual([11, 12, 13].map(ordinal), ["11th", "12th", "13th"]);
  });

  it("handles higher numbers", () => {
    assert.deepEqual([21, 22, 23, 101].map(ordinal), ["21st", "22nd", "23rd", "101st"]);
  });
});
