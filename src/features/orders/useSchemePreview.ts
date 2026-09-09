/**
 * Live scheme proposals for the create-order screen.
 *
 * The v2 engine replaces picking a scheme from a dropdown: the salesperson
 * enters items, and the engine says what free goods those items earn. This
 * hook keeps that answer in step with the order as it is typed.
 *
 * Debounced, because it fires on every quantity keystroke and the answer only
 * matters once typing settles.
 *
 * A failure clears the proposals and is otherwise swallowed. The engine is
 * advisory — an order must remain writable when it is unreachable, and a
 * blocking error over a giveaway that may not even apply would be worse than
 * showing none.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  schemeService,
  type SchemePreviewLine,
  type SchemeProposal,
} from "@/src/services/order.service";

/** Matches the web's 400 ms — long enough to stop mid-word, short enough to feel live. */
const DEBOUNCE_MS = 400;

export interface UseSchemePreviewArgs {
  cardCode: string | null | undefined;
  /** The PARTY's category. Must equal the line category or nothing is proposed. */
  category: string | null | undefined;
  /** Draft lines, paid rows AND combo free halves, in a stable order. */
  lines: SchemePreviewLine[];
  /** Set false to stand the engine down (FOC orders, MART, edit of a posted order). */
  enabled?: boolean;
}

export interface UseSchemePreviewResult {
  /** Proposals grouped by the index of the line that earned them. */
  proposalsByLine: Record<number, SchemeProposal[]>;
  loading: boolean;
}

export const useSchemePreview = ({
  cardCode,
  category,
  lines,
  enabled = true,
}: UseSchemePreviewArgs): UseSchemePreviewResult => {
  const [proposalsByLine, setProposalsByLine] = useState<
    Record<number, SchemeProposal[]>
  >({});
  const [loading, setLoading] = useState(false);

  // Only the newest request may write state. Without this a slow early
  // response can land after a fast later one and show giveaways for
  // quantities the user has already changed.
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The request is rebuilt from `lines` on every render, so comparing the
  // serialised form is what tells us the ORDER actually changed rather than
  // the array identity. Cheap: these are a handful of small objects.
  const signature = JSON.stringify({ cardCode, category, enabled, lines });

  const run = useCallback(async () => {
    const seq = ++requestSeq.current;

    const payloadLines = lines.filter((line) => line?.item_code);
    if (!enabled || !cardCode || payloadLines.length === 0) {
      if (mounted.current) {
        setProposalsByLine({});
        setLoading(false);
      }
      return;
    }

    if (mounted.current) setLoading(true);
    try {
      const res = await schemeService.previewSchemes({
        card_code: String(cardCode),
        category: String(category ?? ""),
        lines: payloadLines,
      });

      if (!mounted.current || seq !== requestSeq.current) return;

      const grouped: Record<number, SchemeProposal[]> = {};
      for (const proposal of res.proposals) {
        // A proposal whose quantity is still the user's to type has nothing to
        // show — the engine states no rule for it. Skipping matches the web.
        if (proposal.qty_is_user_supplied) continue;
        if (Number(proposal.qty) <= 0) continue;
        const index = Number(proposal.line_index);
        if (!Number.isFinite(index)) continue;
        (grouped[index] ||= []).push(proposal);
      }
      setProposalsByLine(grouped);
    } catch (error) {
      // Advisory only — never block order entry on it.
      if (mounted.current && seq === requestSeq.current) {
        setProposalsByLine({});
      }
      console.log("Scheme preview failed", error);
    } finally {
      if (mounted.current && seq === requestSeq.current) setLoading(false);
    }
    // `signature` stands in for the deep contents of `lines`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const timer = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [run]);

  return { proposalsByLine, loading };
};

/**
 * The `schemes[]` entries a proposal becomes on the order payload.
 *
 * `scheme_qty` is PIECES — a SAP DocumentLine quantity always is — while
 * `benefit_qty` keeps the unit the scheme was written in ("1 BOX"), so the
 * saved row still says what was promised as well as what ships.
 *
 * Sent as a whole object rather than rebuilt field by field: the backend
 * qualifies a v2 entry on `scheme_v2_id` alone, and a rebuild that dropped it
 * made entries vanish silently on the web.
 */
export const proposalToSchemeEntry = (proposal: SchemeProposal) => ({
  scheme_id: null,
  scheme_v2_id: proposal.scheme_id,
  benefit_id: proposal.benefit_id,
  benefit_item_code: proposal.benefit_item_code,
  benefit_uom: proposal.free_uom,
  benefit_qty: Number(proposal.qty) || 0,
  scheme_qty: Number(proposal.qty_pieces) || 0,
  computed_qty: Number(proposal.qty_pieces) || 0,
  is_manual_override: false,
  scope_type: proposal.scope_type,
  scope_value: proposal.scope_value,
  scheme_name: proposal.scheme_name,
});

/** "2 boxes (24 pcs)" — spells out both units, as the web does. */
export const formatProposalQty = (proposal: SchemeProposal): string => {
  const qty = Number(proposal.qty) || 0;
  const pieces = Number(proposal.qty_pieces) || 0;
  const uom = (proposal.free_uom || "").toUpperCase();

  if (uom === "BOX") {
    const unit = qty === 1 ? "box" : "boxes";
    return pieces > 0 ? `${qty} ${unit} (${pieces} pcs)` : `${qty} ${unit}`;
  }
  return `${pieces || qty} pcs`;
};
