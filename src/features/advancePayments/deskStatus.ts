import type { AdvanceRequestEntry } from "./logic/approvalData";

/**
 * Where a request stands FOR THE APPROVER READING IT.
 *
 * The document's own status cannot answer this. A request approved at stage 1
 * is still `IN_APPROVAL` — pending — because stage 2 has not seen it yet, so
 * filtering the desk on the document status left every request an approver had
 * already cleared sitting in their "Pending" list for as long as the route ran.
 * What they want to know is what THEY did with it.
 *
 * The server supplies the fact (`my_action`, the last decision this user made
 * on the request) and whether it is theirs right now (`flow.awaiting_me`); this
 * turns the pair into the five states the desk filters on.
 *
 * APP-ONLY, deliberately NOT in `logic/`: those modules are copied verbatim from
 * the web client, which merges both scopes into one list and has no desk filter.
 */
export type DeskStatus =
  | "AWAITING"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED"
  | "WATCHING";

/**
 * Plain words. The list is already only this approver's own requests, so
 * "Approved by me" said "by me" to somebody who cannot see anyone else's — the
 * qualifier carried no information and cost half the dropdown's width.
 */
export const DESK_LABEL: Record<DeskStatus, string> = {
  AWAITING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  WATCHING: "Watching",
};

/** `""` is every request on the desk — not a state of its own. */
export type DeskFilter = "" | DeskStatus;

/**
 * AWAITING WINS. A request this user approved at stage 1 and which has come
 * back to them — returned by a later stage, or because they hold that stage
 * too — is theirs to act on again, and burying it under "Approved by me" is
 * how a request sits undecided for a week.
 *
 * WATCHING is the rest: a completed request on a route where they hold Payment
 * or Final and have not acted yet. It is on the desk (the UTR may be theirs to
 * record) without being a decision they have made.
 */
export function deskStatusOf(entry: AdvanceRequestEntry): DeskStatus {
  if (entry.api.flow?.awaiting_me) return "AWAITING";
  switch (entry.api.my_action) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "RETURNED":
    case "SENT_BACK":
      return "RETURNED";
    default:
      return "WATCHING";
  }
}

/** The desk's own list, narrowed to one of its states. */
export function filterDesk(
  entries: AdvanceRequestEntry[],
  status: DeskFilter,
): AdvanceRequestEntry[] {
  if (!status) return entries;
  return entries.filter((entry) => deskStatusOf(entry) === status);
}

/** How many requests sit in each state — the desk's own counts. */
export function deskCounts(entries: AdvanceRequestEntry[]): Record<DeskStatus, number> {
  const counts: Record<DeskStatus, number> = {
    AWAITING: 0,
    APPROVED: 0,
    REJECTED: 0,
    RETURNED: 0,
    WATCHING: 0,
  };
  for (const entry of entries) counts[deskStatusOf(entry)] += 1;
  return counts;
}
