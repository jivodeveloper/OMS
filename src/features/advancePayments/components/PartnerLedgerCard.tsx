import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapPartnerCompanyBalance,
  type SapPartnerLedger,
} from "@/src/services/advancePayment.service";

import type { AdvanceRequestEntry } from "../logic/approvalData";
import { balanceSide, formatDate, formatINR } from "../logic/rules";

/** The group's companies as a person names them, not as SAP codes them. */
/**
 * How the server says it found the partner, in words an approver reads.
 *
 * `self` is the same card code in the other company and needs no explanation —
 * the code is already shown beside it. An unknown reason falls back to the
 * code alone rather than to a phrase that would claim more than the server
 * said.
 */
const MATCH_LABEL: Record<string, string> = {
  GSTIN: "Same GSTIN",
  PAN: "Same PAN",
  "bank account": "Same bank account",
  name: "Matched by name",
};

const COMPANY_LABEL: Record<string, string> = {
  OIL: "Oil",
  BEVERAGES: "Beverages",
  MART: "Mart",
};

/**
 * The payee's balance and open ledger in SAP — what a payment is weighed
 * against.
 *
 * WHO SEES IT. The approval desk from the Payment stage on, and nobody else:
 * `showsBalance` asks the SERVER (`can.see_account`) rather than guessing from
 * the stage, because the server omits the account details before Payment and a
 * screen that assumed otherwise would render empty rows as fact. Never the
 * requester, and never for a partner who has no SAP account yet (a new imprest
 * holder) — there is no ledger to read until Payment creates one.
 *
 * Read fresh rather than from the request: a balance saved at submission is a
 * figure from days ago, and the whole point of showing it is what is true now.
 *
 * Collapsed by default. On a long-standing vendor this is the longest thing on
 * the page, and the balance line above it answers the usual question on its
 * own.
 */

const money = (value: string | number | null | undefined) => Number(value ?? 0) || 0;

export default function PartnerLedgerCard({ entry }: { entry: AdvanceRequestEntry }) {
  const company = entry.form.company as AdvancePaymentCompany;
  const cardCode = entry.form.partner;
  const who = entry.form.type === "EMPLOYEE_IMPREST" ? "the imprest holder" : "the vendor";

  const [ledger, setLedger] = useState<SapPartnerLedger | null>(null);
  const [balance, setBalance] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  /**
   * THE SAME BUSINESS IN THE GROUP'S OTHER COMPANIES.
   *
   * A vendor paid from Oil often has a balance in Beverages too, and an
   * approver weighing a payment wants to see both. Only where the server says
   * it IS the same business — it matches on PAN, else on name, because a card
   * code can belong to someone else entirely in another company.
   *
   * Never fatal: a failure leaves the other companies unsaid rather than
   * taking the ledger down with it.
   */
  const [others, setOthers] = useState<SapPartnerCompanyBalance[]>([]);

  useEffect(() => {
    if (!company || !cardCode) return;
    let alive = true;
    setLoading(true);
    setError("");

    // Both reads together: one spinner, and the balance and the items it is
    // made of can never be from two different moments.
    Promise.all([
      advancePaymentService.partnerLedger(company, cardCode),
      // The partner lookup searches names AND codes; keep the exact code.
      advancePaymentService
        .vendors(company, cardCode, 50)
        .then((rows) => rows.find((row) => row.card_code === cardCode)?.balance ?? null)
        .catch(() => null),
    ])
      .then(([rows, partnerBalance]) => {
        if (!alive) return;
        setLedger(rows);
        setBalance(partnerBalance);
      })
      .catch((err) => {
        if (alive) setError(advancePaymentError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    advancePaymentService
      .partnerBalances(company, cardCode)
      .then((rows) => {
        if (alive) setOthers(rows.filter((row) => row.company !== company));
      })
      .catch(() => {
        if (alive) setOthers([]);
      });

    return () => {
      alive = false;
    };
  }, [company, cardCode]);

  const summary = ledger?.summary;
  const rows = ledger?.results ?? [];
  const side = balance === null ? null : balanceSide(balance, who);

  // TAP ANYWHERE. The header chevron was the only way in — a target the width
  // of a thumbnail on a card the width of the screen — and it needed a line of
  // text underneath explaining where to press. The card itself is the button
  // now, and that line is gone with it.
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setOpen((current) => !current)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Ledger in SAP, ${open ? "collapse" : "expand"}`}
    >
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Ionicons name="library" size={ms(16)} color={COLORS.primary} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            Ledger in SAP
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {entry.form.partnerName || cardCode}
          </Text>
        </View>
        {/* Collapsed, the balance rides in the header: it is the figure an
            approver actually decides on, so closing the card must not hide it. */}
        {!open && side ? (
          <Text style={styles.headBalance} numberOfLines={1}>
            {formatINR(side.amount)}
            {side.side ? ` ${side.side}` : ""}
          </Text>
        ) : null}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={COLORS.textSecondary}
        />
      </View>

      {/* COLLAPSED IS THE HEADER ALONE. Hiding only the item rows left the
          balance, summary and status lines on screen, so with nothing open in
          SAP the card looked the same either way and the tap did nothing. */}
      {!open ? null : (
        <>
          {side ? (
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Current balance</Text>
              <View style={styles.balanceValueWrap}>
                <Text style={styles.balanceValue}>
                  {formatINR(side.amount)}
                  {side.side ? ` ${side.side}` : ""}
                </Text>
                <Text style={styles.balanceMeaning}>{side.meaning}</Text>
              </View>
            </View>
          ) : null}

          {/* Beside the balance here, the same partner's balance elsewhere in
              the group — the question an approver asks next. */}
          {others.map((row) => {
            const theirs = row.balance === null ? null : balanceSide(row.balance, who);
            // The code is part of the key, not just the label: the same vendor
            // may be filed under more than one code in one company, and the
            // server returns a row for each.
            const elsewhere = row.card_code && row.card_code !== cardCode;
            return (
              <View key={`${row.company}:${row.card_code}`} style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>
                  Balance in {COMPANY_LABEL[row.company]}
                  {elsewhere ? ` (${row.card_code})` : ""}
                </Text>
                <View style={styles.balanceValueWrap}>
                  <Text style={styles.balanceValue}>
                    {row.error || !theirs
                      ? "Could not read SAP"
                      : `${formatINR(theirs.amount)}${theirs.side ? ` ${theirs.side}` : ""}`}
                  </Text>
                  {/* HOW IT WAS MATCHED, because "same code" is not the
                      same as "same business". GSTIN and PAN are documentary;
                      a shared bank account is strong but circumstantial; a
                      name is a judgement, and the reader is the one who should
                      be weighing it. The server's own word is used rather than
                      a phrase of ours, so a reason added there is never
                      silently rendered as "matched" with no reason at all. */}
                  <Text style={styles.balanceMeaning}>
                    {MATCH_LABEL[row.matched_by]
                      ? `${MATCH_LABEL[row.matched_by]} · ${row.card_code}`
                      : row.card_code}
                  </Text>
                </View>
              </View>
            );
          })}

          {summary ? (
            <Text style={styles.summary}>
              {summary.open_count} open · Dr {formatINR(money(summary.open_debit))} · Cr{" "}
              {formatINR(money(summary.open_credit))}
              {summary.overdue_count ? ` · ${summary.overdue_count} overdue` : ""}
            </Text>
          ) : null}

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : loading ? (
            <Text style={styles.muted}>Reading the ledger from SAP…</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.muted}>Nothing open in SAP.</Text>
          ) : (
            <View style={styles.rows}>
              {rows.map((row, index) => {
                const overdue = (row.days_overdue ?? 0) > 0;
                return (
                  <View
                    key={`${row.trans_id}-${row.doc_type_code}-${row.doc_num}-${index}`}
                    style={[
                      styles.row,
                      index > 0 && styles.rowDivider,
                      overdue && styles.rowOverdue,
                    ]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.docName} numberOfLines={1}>
                        {row.doc_type} {row.doc_num}
                      </Text>
                      {row.party_ref ? (
                        <Text style={styles.docMeta} numberOfLines={1}>
                          Ref {row.party_ref}
                        </Text>
                      ) : null}
                      <Text style={styles.docMeta} numberOfLines={1}>
                        {row.posting_date ? formatDate(row.posting_date) : "—"}
                        {row.due_date ? ` · due ${formatDate(row.due_date)}` : ""}
                      </Text>
                      {overdue ? (
                        <Text style={styles.overdueFlag}>{row.days_overdue} days overdue</Text>
                      ) : null}
                    </View>
                    <View style={styles.rowAmount}>
                      <Text style={styles.amount}>{formatINR(money(row.open_amount))}</Text>
                      {/* Which way the item runs. A bare figure is read backwards
                          about half the time, and Dr / Cr is the word the ledger
                          itself uses. */}
                      <Text style={styles.direction}>
                        {row.direction === "DEBIT" ? "Dr" : "Cr"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const OVERDUE_RED = "#E25555";

const styles = StyleSheet.create({
  /**
   * THE DETAIL PAGE'S CARD, to the pixel (`AdvanceDetailsScreen.styles.card`).
   *
   * It had its own smaller geometry and NO side margin, so it ran edge to edge
   * while every box above it sat inside a 14pt gutter — which read as one
   * wide slab joined to the card above rather than as a box of its own.
   */
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginHorizontal: sp(14),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: sp(8),
  },
  head: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  headIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: COLORS.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },
  subtitle: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 1 },
  headBalance: {
    flexShrink: 0,
    maxWidth: "40%",
    fontSize: fs(13),
    fontWeight: "800",
    color: COLORS.text,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    paddingTop: sp(8),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  balanceLabel: { flex: 1, fontSize: fs(12), color: COLORS.textSecondary },
  balanceValueWrap: { alignItems: "flex-end", flexShrink: 1 },
  balanceValue: { fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  balanceMeaning: { fontSize: fs(10.5), color: COLORS.textSecondary, marginTop: 1 },
  summary: { fontSize: fs(11.5), color: COLORS.textSecondary },
  muted: { fontSize: fs(12), color: COLORS.textSecondary },
  error: { fontSize: fs(12), color: OVERDUE_RED },
  rows: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: ms(8),
    overflow: "hidden",
  },
  row: { flexDirection: "row", gap: sp(8), padding: sp(9) },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  rowOverdue: { backgroundColor: OVERDUE_RED + "0F" },
  rowMain: { flex: 1, minWidth: 0, gap: 1 },
  docName: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.text },
  docMeta: { fontSize: fs(11), color: COLORS.textSecondary },
  overdueFlag: { fontSize: fs(10.5), fontWeight: "800", color: OVERDUE_RED, marginTop: 2 },
  rowAmount: { alignItems: "flex-end" },
  amount: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.text },
  direction: { fontSize: fs(10.5), color: COLORS.textSecondary, marginTop: 1 },
});
