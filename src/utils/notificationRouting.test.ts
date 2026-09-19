/**
 * A payment notification opens a payment; a deposit notification opens a deposit.
 *
 * Receipts and deposits are separate business workflows with separate
 * approvers, and their ids overlap — receipt 7 and deposit 7 both exist. So a
 * notification that opened the wrong one would not merely look odd: it would
 * show one person's money under another's reference, and offer approval
 * actions for a document the reader was never asked to approve.
 *
 * Runs on Node's built-in test runner; `notificationRouting.ts` has only a
 * type-only import, so no runner, transform or dependency is needed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEPOSIT_DETAILS_ROUTE,
  PAYMENT_DETAILS_ROUTE,
  resolveNotificationRoute,
} from "./notificationRouting.ts";

/** The shape the push payload arrives in. */
function push(over: Record<string, unknown> = {}) {
  return { entity_type: "paymentreceipt", entity_id: 7, ...over };
}

function routeOf(data: Record<string, unknown>) {
  const href = resolveNotificationRoute(data as never) as
    | { pathname: string; params?: Record<string, unknown> }
    | null;
  return href;
}

describe("payment vs deposit notification routing", () => {
  it("opens a RECEIPT notification on the receipt screen", () => {
    const href = routeOf(push({ entity_type: "paymentreceipt", entity_id: 7 }));
    assert.equal(href?.pathname, PAYMENT_DETAILS_ROUTE);
    // Route params are strings by the time they reach the router.
    assert.equal(Number(href?.params?.documentId), 7);
  });

  it("opens a DEPOSIT notification on the deposit screen", () => {
    const href = routeOf(push({ entity_type: "bankdeposit", entity_id: 7 }));
    assert.equal(href?.pathname, DEPOSIT_DETAILS_ROUTE);
    assert.equal(Number(href?.params?.id), 7);
  });

  it("sends the two apart even when they share an id", () => {
    // THE CASE THIS EXISTS FOR. Nothing about the id distinguishes them; the
    // entity type is the only thing that can.
    const receipt = routeOf(push({ entity_type: "paymentreceipt", entity_id: 7 }));
    const deposit = routeOf(push({ entity_type: "bankdeposit", entity_id: 7 }));

    assert.notEqual(receipt?.pathname, deposit?.pathname);
    assert.equal(receipt?.pathname, PAYMENT_DETAILS_ROUTE);
    assert.equal(deposit?.pathname, DEPOSIT_DETAILS_ROUTE);
  });

  it("is case-insensitive about the entity type", () => {
    assert.equal(
      routeOf(push({ entity_type: "PaymentReceipt" }))?.pathname,
      PAYMENT_DETAILS_ROUTE,
    );
    assert.equal(
      routeOf(push({ entity_type: "BankDeposit" }))?.pathname,
      DEPOSIT_DETAILS_ROUTE,
    );
  });

  it("never guesses a document type it was not told", () => {
    // An unknown entity falls through to the inbox rather than opening
    // whichever screen happens to be first.
    const href = routeOf(push({ entity_type: "somethingelse", entity_id: 7 }));
    assert.notEqual(href?.pathname, PAYMENT_DETAILS_ROUTE);
    assert.notEqual(href?.pathname, DEPOSIT_DETAILS_ROUTE);
  });

  it("does not open a document when the id is missing or unusable", () => {
    for (const bad of [undefined, null, 0, -1, "abc"]) {
      const href = routeOf(push({ entity_type: "bankdeposit", entity_id: bad }));
      assert.notEqual(
        href?.pathname,
        DEPOSIT_DETAILS_ROUTE,
        `entity_id ${String(bad)} should not open a deposit`,
      );
    }
  });

  it("carries the originating screen through, when given", () => {
    // Second argument, not a payload field: the caller knows which list the
    // tap came from, the push does not.
    const href = resolveNotificationRoute(
      push({ entity_type: "bankdeposit", entity_id: 7 }) as never,
      "payments/deposit-tracking",
    ) as { pathname: string; params?: Record<string, unknown> } | null;

    assert.equal(href?.pathname, DEPOSIT_DETAILS_ROUTE);
    assert.equal(href?.params?.from, "payments/deposit-tracking");
  });
});
