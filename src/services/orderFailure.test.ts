/**
 * A refused order action is reported as a refusal, in the server's words.
 *
 * The bug this guards: the client RESOLVES a failed request, so `await`ing it
 * and carrying on announced "Order rejected" for a call the server had
 * refused. These are the shapes `orders/` actually answers with.
 *
 * Runs on Node's built-in runner; `orderFailure.ts` is pure.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { orderProblem } from "./orderFailure.ts";

const FALLBACK = "Failed to reject order";

describe("orderProblem", () => {
  it("is null when the call succeeded", () => {
    // A successful call answers with the DATA — an array of orders — and
    // carries no `success` key at all.
    assert.equal(orderProblem([{ id: 1 }], FALLBACK), null);
    assert.equal(orderProblem({ id: 1, status: "APPROVED" }, FALLBACK), null);
    assert.equal(orderProblem({ success: true, data: [] }, FALLBACK), null);
    assert.equal(orderProblem(null, FALLBACK), null);
  });

  it("quotes the server on a refusal", () => {
    // What `orders/services/order_status.py` now answers for an order that is
    // not waiting for the action.
    assert.equal(
      orderProblem(
        { success: false, message: "Order already rejected" },
        FALLBACK,
      ),
      "Order already rejected",
    );
    assert.equal(
      orderProblem(
        {
          success: false,
          message: "Order SO-1042 is Rejected and must be edited and resubmitted.",
        },
        FALLBACK,
      ),
      "Order SO-1042 is Rejected and must be edited and resubmitted.",
    );
  });

  it("reaches into `errors` when there is no message", () => {
    assert.equal(
      orderProblem({ success: false, errors: { reason: ["This field is required."] } }, FALLBACK),
      "reason: This field is required.",
    );
    assert.equal(
      orderProblem({ success: false, errors: { non_field_errors: ["Not your stage."] } }, FALLBACK),
      "Not your stage.",
    );
  });

  it("falls back only when the server refused and said nothing", () => {
    assert.equal(orderProblem({ success: false }, FALLBACK), FALLBACK);
    assert.equal(orderProblem({ success: false, message: "   " }, FALLBACK), FALLBACK);
  });

  it("passes a thrown error through — a dropped connection says so itself", () => {
    assert.equal(orderProblem(new Error("Network request failed"), FALLBACK), "Network request failed");
    assert.equal(orderProblem(new Error(""), FALLBACK), FALLBACK);
  });
});
