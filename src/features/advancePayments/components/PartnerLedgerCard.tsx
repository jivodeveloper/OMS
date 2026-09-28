import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapPartnerLedger,
} from "@/src/services/advancePayment.service";

import type { AdvanceRequestEntry } from "../logic/approvalData";
import { balanceSide, formatDate, formatINR } from "../logic/rules";

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

    return () => {
      alive = false;
    };
  }, [company, cardCode]);

  const summary = ledger?.summary;
  const rows = ledger?.results ?? [];
  const side = balance === null ? null : balanceSide(balance, who);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.head}
        onPress={() => setOpen((current) => !current)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
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
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {/* The balance stays visible whether or not the items are expanded: it is
          the figure an approver actually decides on. */}
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
      ) : open ? (
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
      ) : (
        <Text style={styles.muted}>
          {rows.length} open {rows.length === 1 ? "item" : "items"} — tap to see them.
        </Text>
      )}
    </View>
  );
}

const OVERDUE_RED = "#E25555";

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: ms(12),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: sp(12),
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
