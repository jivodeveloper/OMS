/**
 * What the server actually said, turned into lines a person can act on.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN MODULE
 * ─────────────────────────────────────────────────────────────────────────
 * "Something went wrong" is the failure this file exists to prevent. The
 * server answers a refusal as `{success: false, message, errors}`
 * (`core/responses.fail`), and the part worth reading is almost always in
 * `errors`:
 *
 *   {"problems": ["Document 10256: 2000 is more than the 1500 still open."]}
 *   {"to_account": ["This field is required."]}
 *   {"expense_lines": [{"amount": ["Enter an amount above zero."]}]}
 *
 * A dialog that prints only the headline throws that away; one that prints
 * "Something went wrong" throws away the headline too. So EVERY refusal in
 * this module comes through here, and nothing in `errors` is silently
 * dropped — including the nested shapes DRF produces for a list of objects,
 * which an earlier version walked one level deep and skipped.
 *
 * PURE, NO REACT AND NO SERVICE IMPORT, so it can be tested on Node's own
 * runner (`failure.test.ts`). `showError.ts` is the thin wrapper that puts
 * these lines in a dialog.
 */

/** A thrown `Error` carrying the app's API envelope. */
export interface Failure {
  status?: number;
  errors?: unknown;
  message?: string;
}

/** As many lines of detail as a dialog can be read at a glance. */
const MAX_DETAILS = 12;

/** A ceiling on the walk itself, so a pathological body cannot hang it. */
const MAX_WALK = 200;

/** One message, and the field path it was found under (empty for a bare one). */
interface Detail {
  where: string;
  text: string;
}

/** `expense_lines` -> `expense lines`; a numeric key is a row, not a field. */
const fieldLabel = (key: string): string =>
  /^\d+$/.test(key) ? `line ${Number(key) + 1}` : key.replace(/_/g, " ");

/**
 * Every string anywhere in `errors`, each prefixed by where it was found.
 *
 * Recursive on purpose: DRF nests a list serializer's errors one object per
 * row, so `expense_lines[1].amount` arrives as an array of objects and a
 * one-level walk sees nothing at all. `non_field_errors` and `problems`
 * contribute no prefix — they are about the whole thing, and naming them in
 * a dialog explains nothing.
 */
function walk(value: unknown, path: string[], out: Detail[]): void {
  if (out.length >= MAX_WALK) return;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return;
    // The server's own sentence and where it was found are kept APART: two
    // fields refused with the same words are one thing said twice, but two
    // sentences that merely end alike ("Line 1: …", "Line 2: …") are not.
    out.push({ where: path.filter(Boolean).join(": "), text });
    return;
  }

  if (Array.isArray(value)) {
    // A list of strings under one field is that field's messages, not rows:
    // numbering them "line 1, line 2" would invent a structure.
    const plain = value.every((item) => typeof item === "string");
    // A row's position is what the reader needs — "line 2", as the server's
    // own messages number them — not its index.
    value.forEach((item, index) =>
      walk(item, plain ? path : [...path, `line ${index + 1}`], out),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const quiet = key === "problems" || key === "non_field_errors" || key === "detail";
      walk(inner, quiet ? path : [...path, fieldLabel(key)], out);
    }
  }
}

/**
 * Every line of detail a refusal carries, flattened.
 *
 * `problems` comes first because it is the shape the advance-payment services
 * use and it is written to be read; a serializer's field map follows.
 */
export function failureDetails(err: unknown): string[] {
  const errors = (err as Failure)?.errors;
  if (errors === undefined || errors === null) return [];

  const problems: Detail[] = [];
  walk((errors as { problems?: unknown })?.problems, [], problems);

  const rest: Detail[] = [];
  if (typeof errors === "object" && !Array.isArray(errors)) {
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (key === "problems") continue;
      const quiet = key === "non_field_errors" || key === "detail";
      walk(value, quiet ? [] : [fieldLabel(key)], rest);
    }
  } else {
    walk(errors, [], rest);
  }

  /*
   * SAID ONCE. The server routinely reports the same thing twice — a
   * serializer's `{"payment_date": ["Enter the Payment Date."]}` beside the
   * service's `problems: ["Enter the Payment Date."]` — so a line whose
   * MESSAGE has already been shown is dropped, prefix and all. The prefixed
   * copy loses, because the unprefixed one is the sentence written to be read.
   */
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const detail of [...problems, ...rest]) {
    if (seen.has(detail.text)) continue;
    seen.add(detail.text);
    unique.push(detail.where ? `${detail.where}: ${detail.text}` : detail.text);
  }
  return unique.length > MAX_DETAILS
    ? [...unique.slice(0, MAX_DETAILS), `…and ${unique.length - MAX_DETAILS} more.`]
    : unique;
}

/**
 * The headline, with the cases that have no message spelled out.
 *
 * A STATUS THAT MEANS SOMETHING SPECIFIC WINS OVER A VAGUE MESSAGE: a 401 is
 * an expired session whatever the body says, because that is the only reading
 * that tells the user what to do. Everything else prefers the server's own
 * words, and the invented sentences are reached only when it said nothing —
 * a dropped connection, a timeout, a 500 with an HTML body.
 */
export function failureMessage(err: unknown): string {
  const failure = err as Failure;
  const message = typeof failure?.message === "string" ? failure.message.trim() : "";
  const generic = /^the request could not be completed\.?$/i.test(message);

  if (failure?.status === 401) return "Your session has expired. Please sign in again.";
  if (message && !generic) return message;

  switch (failure?.status) {
    case undefined:
    case 0:
      return "The server could not be reached. Check the connection and try again.";
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
        : message || "The request could not be completed.";
  }
}

/** The whole refusal as one block of text: the headline, then every detail. */
export function failureText(err: unknown): string {
  return [failureMessage(err), ...failureDetails(err)].join("\n");
}
