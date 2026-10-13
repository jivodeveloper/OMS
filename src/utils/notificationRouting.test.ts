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
  ADVANCE_DETAILS_ROUTE,
  ADVANCE_LIST_ROUTE,
  CREDIT_LIMIT_DETAILS_ROUTE,
  DEPOSIT_DETAILS_ROUTE,
  moduleForEntity,
  NOTIFICATIONS_ROUTE,
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

  it("opens a CREDIT LIMIT notification on the request it names", () => {
    const href = routeOf(
      push({
        entity_type: "creditlimitrequest",
        entity_id: 77,
        event_type: "CREDIT_LIMIT_AWAITING_APPROVAL",
      }),
    );
    assert.equal(href?.pathname, CREDIT_LIMIT_DETAILS_ROUTE);
    assert.equal(href?.params?.id, "77");
  });

  it("sends the credit limit batch notification to the inbox, not a request", () => {
    // A multi-party submission tells each approver ONCE and names no entity;
    // opening one arbitrary request of the batch would be a guess.
    const href = routeOf(
      push({
        entity_type: "creditlimitrequest",
        entity_id: null,
        event_type: "CREDIT_LIMIT_AWAITING_APPROVAL",
      }),
    );
    assert.notEqual(href?.pathname, CREDIT_LIMIT_DETAILS_ROUTE);
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

/**
 * A payment-request notification opens that request.
 *
 * The module the backend calls `advance_payment` sends five events
 * (`advance_payment/services/notify.py`). Four of them name the request they
 * are about and must open it; the fifth names no entity at all and must still
 * land somewhere a person can act.
 *
 * WHY THIS IS ASSERTED. The entity key is `content_type.model`, which for
 * `AdvanceRequest` is "advancerequest" - one word. A wrong key does not throw:
 * it falls through to the inbox, and the notification silently stops leading
 * anywhere. That is exactly what it did before these routes existed.
 */
describe("payment request (advance payment) notification routing", () => {
  const EVENTS = [
    "ADVANCE_PAYMENT_AWAITING_APPROVAL",
    "ADVANCE_PAYMENT_COMPLETED",
    "ADVANCE_PAYMENT_REJECTED",
    "ADVANCE_PAYMENT_RETURNED",
  ];

  it("opens the request named by each of the four request events", () => {
    for (const event of EVENTS) {
      const href = routeOf({
        entity_type: "advancerequest",
        entity_id: 62,
        event_type: event,
      });
      assert.equal(href?.pathname, ADVANCE_DETAILS_ROUTE, event);
      assert.equal(href?.params?.id, "62", event);
    }
  });

  it("is case-insensitive about the entity type", () => {
    assert.equal(
      routeOf({ entity_type: "AdvanceRequest", entity_id: 62 })?.pathname,
      ADVANCE_DETAILS_ROUTE,
    );
  });

  it("does not confuse a request with a receipt that shares its id", () => {
    // Receipt 62 and request 62 both exist. Only the entity type tells them
    // apart, and opening the wrong one would offer approval actions for a
    // document the reader was never asked to approve.
    const request = routeOf({ entity_type: "advancerequest", entity_id: 62 });
    const receipt = routeOf({ entity_type: "paymentreceipt", entity_id: 62 });
    assert.equal(request?.pathname, ADVANCE_DETAILS_ROUTE);
    assert.equal(receipt?.pathname, PAYMENT_DETAILS_ROUTE);
    assert.notEqual(request?.pathname, receipt?.pathname);
  });

  it("sends ASSIGNED to the list, which is where the work is", () => {
    // Bills and POs are sent several at a time and the notification names
    // none of them, so there is no request to open - but "raise the payment
    // request" is an instruction, and the inbox is not where it is carried
    // out. The list holds the Assigned to me view.
    const href = routeOf({ event_type: "ADVANCE_PAYMENT_ASSIGNED" });
    assert.equal(href?.pathname, ADVANCE_LIST_ROUTE);
  });

  it("prefers the request over the event when both are present", () => {
    // An entity is always more specific than the event that carried it.
    const href = routeOf({
      entity_type: "advancerequest",
      entity_id: 9,
      event_type: "ADVANCE_PAYMENT_ASSIGNED",
    });
    assert.equal(href?.pathname, ADVANCE_DETAILS_ROUTE);
  });

  it("still falls back to the inbox for an event it has no screen for", () => {
    const href = routeOf({ event_type: "SOMETHING_NEW" });
    assert.equal(href, NOTIFICATIONS_ROUTE);
  });
});

/**
 * The inbox groups by the ENTITY, not by the `module` the server sends.
 *
 * `notifications/serializers.py::_ENTITY_MODULE` names only two models, so
 * BackDate, Production, Credit Limit and payment requests all arrive labelled
 * "other" and would be filed under one heading nobody chose.
 */
describe("moduleForEntity", () => {
  it("names the module for each entity the inbox can open", () => {
    assert.equal(moduleForEntity("paymentreceipt"), "payments");
    assert.equal(moduleForEntity("bankdeposit"), "deposits");
    assert.equal(moduleForEntity("backdate"), "backdate");
    assert.equal(moduleForEntity("productionorder"), "production");
    assert.equal(moduleForEntity("creditlimitrequest"), "creditLimit");
    assert.equal(moduleForEntity("advancerequest"), "advances");
  });

  it("is case-insensitive and says nothing about what it does not know", () => {
    assert.equal(moduleForEntity("AdvanceRequest"), "advances");
    assert.equal(moduleForEntity("somethingelse"), "");
    assert.equal(moduleForEntity(null), "");
    assert.equal(moduleForEntity(undefined), "");
  });
});
