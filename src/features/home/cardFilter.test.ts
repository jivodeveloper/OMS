/**
 * "The card said 5, the list shows 5" — as assertions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dateFilterForPeriod,
  monthParam,
  optionForLabel,
  parseStatuses,
  statusesForBucket,
  statusesParam,
  windowForPeriod,
} from "./cardFilter.ts";

/* The real payments map, so these tests fail if it ever changes shape. */
const BUCKET_OF: Record<string, "pending" | "approved" | "rejected"> = {
  DRAFT: "pending",
  PENDING_APPROVAL: "pending",
  POSTING_TO_SAP: "pending",
  APPROVED: "approved",
  POSTED: "approved",
  REJECTED: "rejected",
  PENDING_ERROR: "rejected",
  SAP_UNKNOWN: "rejected",
  CANCELLED_IN_SAP: "rejected",
};

describe("statusesForBucket — the set the card counted", () => {
  it("returns every status the bucket covers, not just the obvious one", () => {
    // THE MISMATCH THIS FIXES. The tracking list's "Rejected" option queries
    // status=REJECTED alone, so a card counting 5 opened a list of 1 whenever
    // four of them were SAP failures.
    assert.deepEqual(statusesForBucket(BUCKET_OF, "rejected"), [
      "REJECTED",
      "PENDING_ERROR",
      "SAP_UNKNOWN",
      "CANCELLED_IN_SAP",
    ]);
  });

  it("covers pending, including a draft awaiting its handover check", () => {
    assert.deepEqual(statusesForBucket(BUCKET_OF, "pending"), [
      "DRAFT",
      "PENDING_APPROVAL",
      "POSTING_TO_SAP",
    ]);
  });

  it("puts every status in exactly one bucket", () => {
    // Otherwise the cards double-count, or a status shows in Total and in no
    // card at all.
    const all = Object.keys(BUCKET_OF);
    const buckets = ["pending", "approved", "rejected"] as const;
    const covered = buckets.flatMap((b) => statusesForBucket(BUCKET_OF, b));
    assert.equal(covered.length, all.length);
    assert.equal(new Set(covered).size, all.length);
  });

  it("is empty for a bucket nothing maps to, rather than throwing", () => {
    assert.deepEqual(statusesForBucket(BUCKET_OF, "pending" as never), [
      "DRAFT",
      "PENDING_APPROVAL",
      "POSTING_TO_SAP",
    ]);
    assert.deepEqual(statusesForBucket({}, "rejected"), []);
  });
});

describe("the status set on the wire", () => {
  it("joins with commas, as the API's status filter expects", () => {
    assert.equal(statusesParam(["REJECTED", "SAP_UNKNOWN"]), "REJECTED,SAP_UNKNOWN");
  });

  it("is undefined for an empty set, so the Total card filters nothing", () => {
    // Sending `status=` would ask for documents whose status is the empty
    // string — an empty list where the user expected everything.
    assert.equal(statusesParam([]), undefined);
    assert.equal(statusesParam(["", ""]), undefined);
  });

  it("round-trips", () => {
    const set = ["REJECTED", "PENDING_ERROR", "SAP_UNKNOWN"];
    assert.deepEqual(parseStatuses(statusesParam(set)), set);
  });

  it("tolerates spaces and stray commas coming back", () => {
    assert.deepEqual(parseStatuses(" A , ,B,"), ["A", "B"]);
    assert.deepEqual(parseStatuses(undefined), []);
    assert.deepEqual(parseStatuses(""), []);
  });
});

describe("the period travels with the card", () => {
  it("names a month the way the picker means it", () => {
    assert.equal(monthParam(2026, 9), "2026-09");
    assert.equal(monthParam(2026, 12), "2026-12");
  });

  it("month 0 means the whole year", () => {
    assert.equal(monthParam(2026, 0), "2026");
  });

  it("bounds a month correctly, including February in a leap year", () => {
    assert.deepEqual(windowForPeriod("2026-09"), {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    assert.deepEqual(windowForPeriod("2026-02"), {
      from: "2026-02-01",
      to: "2026-02-28",
    });
    assert.deepEqual(windowForPeriod("2028-02"), {
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("bounds a whole year", () => {
    assert.deepEqual(windowForPeriod("2026"), {
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("returns null rather than a wrong window for nonsense", () => {
    for (const raw of [undefined, null, "", "September", "26-09", "2026-9"]) {
      assert.equal(windowForPeriod(raw), null, String(raw));
    }
  });

  it("becomes the date control's own value", () => {
    assert.deepEqual(dateFilterForPeriod("2026-09"), {
      mode: "month",
      value: "2026-09",
    });
    assert.deepEqual(dateFilterForPeriod("2026"), {
      mode: "year",
      value: "2026",
    });
    assert.equal(dateFilterForPeriod("rubbish"), null);
  });
});

describe("optionForLabel — for lists whose options already mean the same", () => {
  const creator = [
    { label: "All", value: "all" },
    { label: "Pending", value: "PENDING" },
    { label: "Completed", value: "POSTED" },
    { label: "Rejected", value: "REJECTED" },
  ];
  const approver = [
    { label: "All", value: "all" },
    { label: "Pending", value: "awaiting_me" },
    { label: "Approved", value: "approved_by_me" },
    { label: "Rejected", value: "rejected_by_me" },
  ];

  it("resolves the same label to each role's own value", () => {
    assert.equal(optionForLabel("Pending", creator)?.value, "PENDING");
    assert.equal(optionForLabel("Pending", approver)?.value, "awaiting_me");
  });

  it("falls back from Approved to Completed for a creator", () => {
    // A creator has no rung to have approved at; their equivalent is posted.
    assert.equal(optionForLabel("Approved", creator)?.value, "POSTED");
  });

  it("prefers the exact label when a list has both", () => {
    const both = [
      { label: "Approved", value: "APPROVED" },
      { label: "Completed", value: "COMPLETED" },
    ];
    assert.equal(optionForLabel("Approved", both)?.value, "APPROVED");
  });

  it("is case-insensitive", () => {
    assert.equal(optionForLabel("pending", creator)?.value, "PENDING");
    assert.equal(optionForLabel("REJECTED", creator)?.value, "REJECTED");
  });

  it("returns undefined rather than a wrong option", () => {
    // The caller then leaves the list on its own default instead of silently
    // showing a filter the user did not ask for.
    assert.equal(optionForLabel("Banana", creator), undefined);
    assert.equal(optionForLabel(undefined, creator), undefined);
    assert.equal(optionForLabel("", creator), undefined);
  });
});
