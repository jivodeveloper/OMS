/**
 * What the server said when an order action was refused.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * This app's fetch client RESOLVES a failed request — it answers
 * `{success: false, message, errors}` rather than throwing (see
 * `services/api.ts`). The order screens were written around a client that
 * throws: they `await` the call, fall straight into the success path and
 * announce "Order rejected", while the server had refused and changed
 * nothing. The `catch` they were relying on only ever fires for a dropped
 * connection.
 *
 * That was survivable while the server refused almost nothing. It is not now:
 * an order may no longer be approved or rejected unless it is actually
 * waiting for that, and a rejected one re-enters the flow only by being
 * edited and resubmitted (`orders/services/order_status.py`). So the refusals
 * are both commonplace and worth reading — "Order already rejected", "Order
 * SO-1042 is Rejected and must be edited and resubmitted."
 *
 * `orderProblem` returns that sentence, or null when the call succeeded.
 * Pure, so it can be tested without a server.
 */

/** The envelope this app's client answers a failed request with. */
interface Envelope {
  success?: boolean;
  message?: unknown;
  detail?: unknown;
  error?: unknown;
  errors?: unknown;
  status?: number;
}

/** The first readable sentence in a DRF-shaped `errors` value. */
function firstError(errors: unknown): string {
  if (typeof errors === "string") return errors.trim();
  if (Array.isArray(errors)) {
    for (const item of errors) {
      const found = firstError(item);
      if (found) return found;
    }
    return "";
  }
  if (errors && typeof errors === "object") {
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      const found = firstError(value);
      if (!found) continue;
      // `non_field_errors` names no field a person recognises.
      return key === "non_field_errors" || key === "detail" ? found : `${key}: ${found}`;
    }
  }
  return "";
}

/**
 * Why the call failed, or null when it did not.
 *
 * `fallback` is used only when the server refused but said nothing at all —
 * never as a replacement for what it did say.
 */
export function orderProblem(answer: unknown, fallback: string): string | null {
  // A thrown Error: a dropped connection, or a client-side guard.
  if (answer instanceof Error) return answer.message || fallback;

  if (!answer || typeof answer !== "object") return null;
  const envelope = answer as Envelope;
  // Only an EXPLICIT false is a refusal. A successful call answers with the
  // data itself — an array of orders, say — and has no `success` at all.
  if (envelope.success !== false) return null;

  for (const candidate of [envelope.message, envelope.detail, envelope.error]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return firstError(envelope.errors) || fallback;
}

export default orderProblem;
