/**
 * An approver's list is about what THEY did, not what the document is.
 *
 * The bug this pins: a request approved at stage 1 stays `IN_APPROVAL` until the
 * whole route finishes, so a desk filtered on the document's status showed
 * everything the approver had already cleared under "Pending" — for days.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DESK_LABEL, deskCounts, deskStatusOf, filterDesk } from "./deskStatus.ts";
import type { AdvanceRequestEntry } from "./logic/approvalData.ts";

/** Only the two fields the desk reads; the rest of the entry is irrelevant here. */
const entry = (
  my_action: string,
  awaiting_me = false,
): AdvanceRequestEntry =>
  ({
    api: { my_action, flow: { awaiting_me } },
  }) as unknown as AdvanceRequestEntry;

describe("where a request stands for the approver reading it", () => {
  it("is PENDING only while it is theirs to act on", () => {
    // Still IN_APPROVAL as a document, but this approver has finished with it.
    assert.equal(deskStatusOf(entry("APPROVED")), "APPROVED");
    assert.equal(deskStatusOf(entry("REJECTED")), "REJECTED");
    assert.equal(deskStatusOf(entry("RETURNED")), "RETURNED");
    assert.equal(deskStatusOf(entry("SENT_BACK")), "RETURNED");
    assert.equal(deskStatusOf(entry("", true)), "AWAITING");
  });

  it("puts a request that has come BACK to them in Pending again", () => {
    // They approved it once and a later stage returned it: it is theirs now,
    // and filing it under "Approved by me" is how it sits undecided for a week.
    assert.equal(deskStatusOf(entry("APPROVED", true)), "AWAITING");
  });

  it("calls a request they have never decided Watching, not Pending", () => {
    // A completed request on a route where they hold Payment or Final: on the
    // desk because the UTR may be theirs to record, but not their decision.
    assert.equal(deskStatusOf(entry("")), "WATCHING");
  });

  it("filters and counts on that, not on the document", () => {
    const desk = [
      entry("", true),
      entry("APPROVED"),
      entry("APPROVED"),
      entry("REJECTED"),
      entry(""),
    ];

    assert.equal(filterDesk(desk, "APPROVED").length, 2);
    assert.equal(filterDesk(desk, "AWAITING").length, 1);
    assert.equal(filterDesk(desk, "").length, 5, "no filter is every request");

    assert.deepEqual(deskCounts(desk), {
      AWAITING: 1,
      APPROVED: 2,
      REJECTED: 1,
      RETURNED: 0,
      WATCHING: 1,
    });
  });

  it("names each state plainly — the list is already only their own", () => {
    assert.equal(DESK_LABEL.AWAITING, "Pending");
    assert.equal(DESK_LABEL.APPROVED, "Approved");
    assert.equal(DESK_LABEL.REJECTED, "Rejected");
  });
});
