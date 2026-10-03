import type { AdvancePaymentCompany } from "@/src/services/advancePayment.service";

/** One open document, as the dispatch pages pass it between themselves. */
export interface DispatchRow {
  key: string;
  docEntry: number;
  docNum: string;
  cardCode: string;
  cardName: string;
  vendorRef: string;
  date: string | null;
  dueDate: string | null;
  total: string;
  open: string;
}

export interface DispatchSelection {
  company: AdvancePaymentCompany;
  kind: "BILL" | "PO";
  rows: DispatchRow[];
}

/**
 * The ticked documents, handed from the picking screen to the sending one.
 *
 * WHY NOT ROUTE PARAMS. A selection is a list of objects; expo-router params
 * are a URL, so passing it would mean serialising and re-parsing it, and a
 * mistake there is a wrong document sent rather than an error. One slot,
 * written on Next and taken when the review screen mounts, so nothing
 * accumulates and a stale selection cannot be picked up by a later visit.
 */
let handover: DispatchSelection | null = null;

export function holdSelection(selection: DispatchSelection): void {
  handover = selection;
}

/**
 * Look at the held selection without spending it.
 *
 * The picking screen unmounts while the sending screen is up, so this is how
 * its ticks come back when the user returns without sending.
 */
export function peekSelection(): DispatchSelection | null {
  return handover;
}

/** Take the selection, if there is one. Reading it clears it. */
export function takeSelection(): DispatchSelection | null {
  const held = handover;
  handover = null;
  return held;
}

/**
 * Whether the sending screen actually sent what it was handed.
 *
 * The picking screen needs to know on its way back: documents that went out
 * are no longer open, so the ticks are spent — while coming back WITHOUT
 * sending must keep them, which is the whole reason Next is not Send.
 */
let sent = false;

export function markSent(): void {
  sent = true;
}

/** Reading it clears it, so one send clears the ticks once. */
export function takeSent(): boolean {
  const was = sent;
  sent = false;
  return was;
}
