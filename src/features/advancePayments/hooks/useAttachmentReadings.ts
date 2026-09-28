import { useEffect, useRef, useState } from "react";

import {
  advancePaymentError,
  advancePaymentService,
  type AttachmentCheck,
} from "@/src/services/advancePayment.service";

import type { DocumentAttachment, OpenDocument } from "../logic/constants";

/**
 * Read every chosen document's SAP attachment IN THE BACKGROUND, while the
 * requester fills in the rest of the form.
 *
 * WHY IT IS NOT ON A BUTTON. The reading is OCR on a scan — ~10 s a page — and
 * it is an APPROVER'S check, not the requester's: they gain nothing from
 * waiting for it and would learn nothing from the answer. So it starts the
 * moment a document is ticked, shows the requester nothing, and only Submit
 * waits, so each document is saved with what its attachment said. The pause at
 * Submit is usually none at all, because by then the reads have long finished.
 *
 * A reading that FAILS is kept as its error rather than retried: a document
 * whose attachment cannot be read must not be able to hold a request up.
 *
 * Cached by attachment for the life of the screen, so un-ticking a document and
 * ticking it again does not read it a second time — and the server caches the
 * OCR too, so even a fresh read of a seen document is instant.
 *
 * Mirrors the web's `readingQuery.useBackgroundReadings`, which gets the same
 * behaviour from React Query. The app has no query client on this screen, so
 * the caching and de-duplication are explicit here.
 */

/** Identifies one attachment: the same four values the web keys its query on. */
const keyOf = (attachment: DocumentAttachment) =>
  `${attachment.company}|${attachment.kind}|${attachment.docEntry}|${attachment.fileName}`;

export interface BackgroundReadings {
  /** At least one attachment is still being read; Submit should wait. */
  pending: boolean;
  /** Document id -> what its attachment said, or why it could not be read. */
  readings: Map<string, AttachmentCheck>;
}

export function useBackgroundReadings(documents: OpenDocument[]): BackgroundReadings {
  // Keyed by ATTACHMENT, not by document, so the cache survives a document
  // being un-ticked and re-ticked, and two documents sharing an attachment are
  // read once.
  const cache = useRef(new Map<string, AttachmentCheck>());
  const inFlight = useRef(new Set<string>());
  const [, bump] = useState(0);

  // A document already carrying a reading is one being edited: it was read when
  // the request was raised, and re-reading it would replace what the approvers
  // have already been shown.
  const toRead = documents.filter((doc) => doc.attachment && !doc.reading);
  const keys = toRead.map((doc) => keyOf(doc.attachment!)).join(",");

  useEffect(() => {
    let alive = true;

    for (const doc of toRead) {
      const attachment = doc.attachment!;
      const key = keyOf(attachment);
      if (cache.current.has(key) || inFlight.current.has(key)) continue;

      inFlight.current.add(key);
      advancePaymentService
        .readDocumentAttachment(attachment.company, attachment.kind, attachment.docEntry)
        .then((reading) => cache.current.set(key, reading))
        .catch((err) => cache.current.set(key, { error: advancePaymentError(err) }))
        .finally(() => {
          inFlight.current.delete(key);
          // Re-render so `pending` falls and Submit stops waiting. Guarded:
          // the screen may have gone while SAP was reading.
          if (alive) bump((n) => n + 1);
        });
    }

    return () => {
      alive = false;
    };
    // `keys` is the set of attachments to read; the array identity is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const readings = new Map<string, AttachmentCheck>();
  let pending = false;
  for (const doc of toRead) {
    const key = keyOf(doc.attachment!);
    const found = cache.current.get(key);
    if (found) readings.set(doc.id, found);
    else pending = true;
  }

  return { pending, readings };
}

/**
 * The chosen documents with their readings folded in — what Submit sends.
 *
 * Kept separate from the hook so the screens can call it at the moment they
 * save, rather than rebuilding the whole form on every background answer.
 */
export function withReadings<T extends { selected: OpenDocument[] }>(
  form: T,
  readings: Map<string, AttachmentCheck>,
): T {
  if (readings.size === 0) return form;
  return {
    ...form,
    selected: form.selected.map((doc) =>
      readings.has(doc.id) ? { ...doc, reading: readings.get(doc.id) } : doc,
    ),
  };
}
