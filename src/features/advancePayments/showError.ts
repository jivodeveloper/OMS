import { appAlert } from "@/src/components/common/AppDialog";
import {
  advancePaymentError,
  advancePaymentProblems,
} from "@/src/services/advancePayment.service";

/**
 * Every refusal this module shows, in the server's own words.
 *
 * WHY THIS EXISTS. The server answers a refusal as
 * `{success: false, message, errors}` (`core/responses.fail`), and the detail
 * is in `errors`: `{problems: [...]}` from the request and flow services, or a
 * serializer's `{field: ["..."]}`. A dialog that prints only the headline —
 * "The request could not be saved." — throws away the one part that says what
 * to do about it, and "Something went wrong" throws away both.
 *
 * So every catch in this feature goes through here: the headline first, then
 * each line of detail under it, and a sentence of its own for the cases where
 * there is no message at all (a dropped connection, a timeout, a 500 with an
 * HTML body). The caller passes the TITLE, because what failed is the one thing
 * the server cannot know: "Could not send", "Cannot raise this one".
 */

/** A thrown `Error` carrying the app's API envelope. */
interface Failure {
  status?: number;
  errors?: unknown;
  message?: string;
}

/**
 * Every line of detail a refusal carries, flattened.
 *
 * `problems` is the shape the advance-payment services use, and it comes first
 * because it is written to be read. Anything else in `errors` is a serializer's
 * field map, which is still worth showing — "budget_code: This field is
 * required." says more than nothing — so each key is named and its messages
 * follow.
 */
export function failureDetails(err: unknown): string[] {
  const problems = advancePaymentProblems(err);
  const errors = (err as Failure)?.errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return problems;

  const rest: string[] = [];
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    if (key === "problems") continue;
    const lines = Array.isArray(value) ? value : [value];
    for (const line of lines) {
      if (typeof line === "string" && line.trim()) {
        // `non_field_errors` is DRF's name for "about the whole thing", and
        // naming it in a dialog explains nothing.
        rest.push(key === "non_field_errors" ? line : `${key.replace(/_/g, " ")}: ${line}`);
      }
    }
  }
  return [...problems, ...rest];
}

/**
 * The headline, with the cases that have no message spelled out.
 *
 * `advancePaymentError` is shared with the web and ends on a reading sentence
 * ("Could not load from SAP"), which is wrong for a save or a send — so the
 * statuses that mean something specific are named here, and the generic tail is
 * only reached when the server truly said nothing.
 */
export function failureMessage(err: unknown): string {
  const failure = err as Failure;
  const message = typeof failure?.message === "string" ? failure.message.trim() : "";
  if (message && !/^the request could not be completed\.?$/i.test(message)) {
    return advancePaymentError(err);
  }
  switch (failure?.status) {
    case undefined:
    case 0:
      return "The server could not be reached. Check the connection and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You are not allowed to do that.";
    case 404:
      return "That is no longer there — it may have been changed or removed.";
    case 409:
      return "Somebody changed this while you had it open. Re-open it and try again.";
    case 502:
    case 503:
      return "SAP could not be reached. Try again shortly.";
    default:
      return failure?.status
        ? `The server refused that (${failure.status}).`
        : advancePaymentError(err);
  }
}

/**
 * Show a refusal: the title, the server's message, and every line of detail.
 *
 * A plain `Error` thrown by this feature's own logic (`formFromAssignment`
 * says a bill is no longer open) carries its sentence in `message` and no
 * envelope, and comes out of here unchanged.
 */
export function showFailure(title: string, err: unknown): void {
  const lines = [failureMessage(err), ...failureDetails(err)];
  appAlert(title, lines.join("\n"));
}
