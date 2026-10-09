import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapBillBreakdown,
} from "@/src/services/advancePayment.service";

import { failureDetails, failureMessage } from "../showError";
import { formatINR } from "../logic/rules";

/**
 * One A/P invoice as SAP booked it: taxable, GST, TDS and net, the G/L account
 * behind every line, and the accounts the taxes sit in.
 *
 * WHAT A PAYMENT IS ACTUALLY CHECKED AGAINST. The open amount on the picker
 * says what is left to pay; this says what the bill IS — whether SAP already
 * withheld TDS on it, which expense accounts it posted to, what the vendor's
 * invoice showed before tax. For the desk from the Payment stage on, which is
 * where those questions get asked.
 *
 * CLOSED UNTIL OPENED, and read only then: a request may pay a dozen bills and
 * each breakdown is three SAP queries. Opening one on a phone should not mean
 * having waited for twelve.
 */

const money = (value: string | null | undefined) => formatINR(Number(value ?? 0) || 0);
const account = (code: string, name: string) => (code ? (name ? `${code} · ${name}` : code) : "—");

/** One labelled figure of the summary grid. */
function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, strong && styles.factStrong]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Breakdown({
  company,
  docEntry,
}: {
  company: AdvancePaymentCompany;
  docEntry: number;
}) {
  const [bill, setBill] = useState<SapBillBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .billBreakdown(company, docEntry)
      .then((found) => {
        if (alive) setBill(found);
      })
      .catch((err) => {
        if (!alive) return;
        // The server's own words: "SAP has no such A/P invoice." reads very
        // differently from "SAP could not be reached".
        setError([failureMessage(err), ...failureDetails(err)].join(" "));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company, docEntry]);

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.muted}>Reading the bill from SAP…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <Text style={styles.error} accessibilityRole="alert">
        {error}
      </Text>
    );
  }

  if (!bill) return null;

  const { header: h, lines, gst, tds } = bill;
  // Freight, a discount or SAP's rounding: shown only when one of them is
  // non-zero, because on most bills all three are and the row says nothing.
  const extras = Number(h.freight) || Number(h.discount) || Number(h.rounding);

  return (
    <View style={styles.body}>
      <View style={styles.grid}>
        <Fact label="Taxable" value={money(h.taxable)} />
        <Fact label="GST" value={money(h.gst)} />
        <Fact label="Invoice Total" value={money(h.gross)} />
        <Fact label="TDS" value={Number(h.tds) ? `− ${money(h.tds)}` : "None"} />
        <Fact label="Net Payable" value={money(h.net)} strong />
        <Fact label="Paid / Balance" value={`${money(h.paid)} / ${money(h.balance)}`} />
      </View>

      {extras ? (
        <Text style={styles.note}>
          Freight {money(h.freight)} · Discount {money(h.discount)} · Rounding{" "}
          {money(h.rounding)}
        </Text>
      ) : null}

      <Text style={styles.note}>
        Payable account {account(h.payable_account, h.payable_account_name)}
      </Text>

      {/* THE G/L BEHIND EACH LINE — a list of rows, not a table: four columns
          of figures do not fit a phone, and a sideways scroll hides the one
          column somebody came to read. */}
      <Text style={styles.heading}>G/L lines</Text>
      {lines.map((line) => (
        <View key={line.line} style={styles.row}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {line.description || line.item_code || `Line ${line.line + 1}`}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={2}>
            {account(line.account, line.account_name)}
            {line.tax_code ? ` · ${line.tax_code}` : ""}
          </Text>
          <Text style={styles.rowFigures}>
            Taxable {money(line.taxable)} · GST {money(line.gst)}
          </Text>
        </View>
      ))}

      {gst.length || tds.length ? (
        <>
          <Text style={styles.heading}>Taxes</Text>
          {gst.map((row) => (
            <View key={`gst-${row.code}-${row.account}`} style={styles.row}>
              <Text style={styles.rowTitle}>{row.code}</Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {account(row.account, row.account_name)}
              </Text>
              <Text style={styles.rowFigures}>
                On {money(row.base)} · {money(row.amount)}
              </Text>
            </View>
          ))}
          {tds.map((row) => (
            <View key={`tds-${row.code}`} style={styles.row}>
              <Text style={styles.rowTitle}>
                TDS {row.code} @ {Number(row.rate) || 0}%
              </Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {row.name ? `${row.name} · ` : ""}
                {account(row.account, row.account_name)}
              </Text>
              <Text style={styles.rowFigures}>
                On {money(row.taxable)} · − {money(row.amount)}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** The breakdown behind a tap; nothing reaches SAP until it is opened. */
export default function BillBreakdown({
  company,
  docEntry,
  label,
}: {
  company: AdvancePaymentCompany;
  docEntry: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen((current) => !current)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons
          name={open ? "chevron-down" : "chevron-forward"}
          size={ms(14)}
          color={COLORS.primary}
        />
        <Text style={styles.toggleText} numberOfLines={2}>
          {label}
        </Text>
      </TouchableOpacity>

      {open ? <Breakdown company={company} docEntry={docEntry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: sp(8) },
  toggle: { flexDirection: "row", alignItems: "center", gap: sp(6), paddingVertical: sp(6) },
  // `minWidth: 0` so a long label wraps instead of pushing the chevron out.
  toggleText: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(11.5),
    fontWeight: "800",
    color: COLORS.primary,
  },

  body: { gap: sp(6), paddingTop: sp(4) },
  centre: { flexDirection: "row", alignItems: "center", gap: sp(8), paddingVertical: sp(8) },
  muted: { fontSize: fs(12), color: COLORS.textSecondary },
  error: { fontSize: fs(12), color: COLORS.error, paddingVertical: sp(6) },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  fact: { width: "50%", paddingRight: sp(10), paddingVertical: sp(4) },
  factLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  factValue: { fontSize: fs(13), fontWeight: "700", color: COLORS.text, marginTop: 1 },
  factStrong: { fontSize: fs(14), fontWeight: "900", color: COLORS.primary },

  note: { fontSize: fs(11), color: COLORS.textSecondary },
  heading: {
    fontSize: fs(10.5),
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
    marginTop: sp(8),
  },

  row: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: sp(6),
  },
  rowTitle: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.text },
  rowMeta: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 1 },
  rowFigures: { fontSize: fs(11.5), color: COLORS.text, marginTop: 2 },
});
