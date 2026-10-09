/**
 * A refusal is shown in the server's own words — all of them.
 *
 * These are the shapes the backend actually answers with: `errors.problems`
 * from the request and flow services, a serializer's field map, and DRF's
 * nested list errors (one object per row), which an earlier one-level walk
 * dropped entirely — the dialog then said only "Please correct the
 * highlighted fields", which names nothing.
 *
 * Runs on Node's built-in runner: `failure.ts` is pure and imports nothing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { failureDetails, failureMessage, failureText } from "./failure.ts";

/** A refusal as the fetch client throws it. */
function refusal(status: number, message: string, errors?: unknown) {
  return Object.assign(new Error(message), { status, errors });
}

describe("what the dialog says a refusal was", () => {
  it("names each problem the services listed", () => {
    const err = refusal(400, "Please correct the highlighted fields.", {
      problems: [
        "Document 10256: 2000 is more than the 1500 still open.",
        "Enter the Payment Date.",
      ],
    });
    assert.equal(failureMessage(err), "Please correct the highlighted fields.");
    assert.deepEqual(failureDetails(err), [
      "Document 10256: 2000 is more than the 1500 still open.",
      "Enter the Payment Date.",
    ]);
  });

  it("names the field a serializer refused", () => {
    const err = refusal(400, "Please correct the highlighted fields.", {
      to_account: ["This field is required."],
      non_field_errors: ["The payment lines come to 4,000, not 5,000."],
    });
    assert.deepEqual(failureDetails(err), [
      "to account: This field is required.",
      "The payment lines come to 4,000, not 5,000.",
    ]);
  });

  it("reaches INTO a list serializer's rows, which is where expense lines fail", () => {
    // DRF answers a list serializer with one object per row, empty for the
    // rows that were fine. A one-level walk saw only objects and said nothing.
    const err = refusal(400, "Please correct the highlighted fields.", {
      expense_lines: [{}, { amount: ["Enter an amount above zero."] }],
    });
    assert.deepEqual(failureDetails(err), [
      "expense lines: line 2: amount: Enter an amount above zero.",
    ]);
  });

  it("keeps a bare string or a bare list of them", () => {
    assert.deepEqual(failureDetails(refusal(409, "No.", "The workflow has no stages.")), [
      "The workflow has no stages.",
    ]);
    assert.deepEqual(failureDetails(refusal(409, "No.", ["One.", "Two."])), ["One.", "Two."]);
  });

  it("says each thing once, however many ways the server said it", () => {
    const err = refusal(400, "No.", {
      problems: ["Enter the Payment Date."],
      payment_date: ["Enter the Payment Date."],
    });
    assert.deepEqual(failureDetails(err), ["Enter the Payment Date."]);
  });

  it("stops a hundred-line refusal from filling the screen", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}: enter an amount.`);
    const shown = failureDetails(refusal(400, "No.", { problems: many }));
    assert.equal(shown.length, 13);
    assert.equal(shown[12], "…and 18 more.");
  });

  it("says what finds a 500 in the log, since the server will not say what broke", () => {
    // An unhandled exception comes back as the generic sentence and nothing
    // else — the server keeps the exception's text out of the response on
    // purpose. The client adds what LOCATES it: the request id every log line
    // for that request is tagged with, and the endpoint (see `api.ts`).
    const err = refusal(500, "An unexpected error occurred. The incident has been logged.", {
      "request id": "b0ba2758457f4911",
      endpoint: "POST /advance-payments/requests/81/payout/ -> 500",
    });
    assert.deepEqual(failureDetails(err), [
      "request id: b0ba2758457f4911",
      "endpoint: POST /advance-payments/requests/81/payout/ -> 500",
    ]);
  });

  it("has nothing to add when the server sent no detail", () => {
    assert.deepEqual(failureDetails(refusal(500, "Server error.")), []);
    assert.deepEqual(failureDetails(new Error("Offline")), []);
  });
});

describe("the headline", () => {
  it("prefers the server's own words", () => {
    assert.equal(
      failureMessage(refusal(409, "That is no longer this user's to decide.")),
      "That is no longer this user's to decide.",
    );
  });

  it("explains an expired session whatever the body said", () => {
    // The only status whose meaning outranks the message: nothing else tells
    // the reader that signing in again is what fixes it.
    assert.equal(
      failureMessage(refusal(401, "Authentication credentials were not provided.")),
      "Your session has expired. Please sign in again.",
    );
  });

  it("speaks for a server that said nothing", () => {
    assert.equal(
      failureMessage(new Error("")),
      "The server could not be reached. Check the connection and try again.",
    );
    assert.equal(
      failureMessage(refusal(409, "The request could not be completed.")),
      "Somebody changed this while you had it open. Re-open it and try again.",
    );
    assert.equal(failureMessage(refusal(500, "")), "The server refused that (500).");
  });

  it("is never 'something went wrong'", () => {
    for (const err of [
      new Error(""),
      refusal(500, ""),
      refusal(400, "The request could not be completed."),
      refusal(503, ""),
    ]) {
      assert.doesNotMatch(failureMessage(err), /something went wrong/i);
    }
  });

  it("reads as one block: the headline, then every reason", () => {
    const err = refusal(400, "Could not be saved.", { problems: ["A.", "B."] });
    assert.equal(failureText(err), "Could not be saved.\nA.\nB.");
  });
});
