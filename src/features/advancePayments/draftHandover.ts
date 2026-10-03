import type { RequestForm } from "./logic/rules";

/**
 * One form, handed from the list to the create screen.
 *
 * WHY NOT A ROUTE PARAM. Raising an assigned bill means opening the form
 * already filled from the document — company, type, Against Bill / PO, the
 * vendor and the document with its payment line. That is an object with nested
 * arrays, and expo-router params are a URL: serialising it would mean parsing
 * it back, and a mistake there is a half-filled form rather than an error.
 *
 * So the list builds the form (the document is read live from SAP there, which
 * is where a document no longer open must be refused) and leaves it here; the
 * create screen takes it by the assignment's id, which IS a route param, and
 * clears it. One slot, written and read in the same tap: nothing accumulates,
 * and a stale draft cannot be picked up by a later visit.
 */
let handover: { assignment: number; form: RequestForm } | null = null;

/** Leave the filled form for the create screen to pick up. */
export function draftForAssignment(assignment: number, form: RequestForm): void {
  handover = { assignment, form };
}

/** Take it, if this is the screen it was left for. Reading it clears it. */
export function takeDraftFor(assignment: number): RequestForm | null {
  if (!handover || handover.assignment !== assignment) return null;
  const { form } = handover;
  handover = null;
  return form;
}
