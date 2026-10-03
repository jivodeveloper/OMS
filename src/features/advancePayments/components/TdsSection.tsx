import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import {
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type TdsCode,
  type TdsOptions,
} from "@/src/services/advancePayment.service";

import { tdsAmountFor, type PayoutDetails } from "../logic/payout";
import { formatINR } from "../logic/rules";
import { Notice, NoticeText, Section, Select } from "./AdvanceUi";

/**
 * TDS on a vendor payment, deducted at the Payment stage.
 *
 * THE WEB'S `TdsSection`, part for part: tick it, pick the rate, then the
 * SECTION at that rate — and the section is what fixes the 2133xxx account the
 * deduction is booked to, so the vendor's own SAP codes are marked. The methods
 * then pay the NET, which is why choosing a code rewrites a single full-amount
 * line (`netPayable`); a split the payer has already made is left alone, since
 * only they know which line the deduction comes off.
 *
 * BLOCKED when a bill being paid already had TDS deducted in SAP: deducting it
 * twice is a figure nobody can reconcile, and the server refuses it too.
 *
 * Read-only away from the Payment stage: a later approver is told what was
 * deducted, which is what they are signing off, and cannot change it.
 */
export default function TdsSection({
  value,
  onChange,
  requestAmount,
  context,
  readOnly,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  requestAmount: number;
  context: { company: AdvancePaymentCompany; cardCode: string; bills: number[] };
  readOnly: boolean;
}) {
  const [options, setOptions] = useState<TdsOptions | null>(null);
  const [error, setError] = useState("");
  const tds = value.tds;

  useEffect(() => {
    if (readOnly || !context.cardCode) return;
    let alive = true;
    advancePaymentService
      .tdsOptions(context.company, context.cardCode, context.bills)
      .then((found) => {
        if (alive) setOptions(found);
      })
      .catch((err) => {
        if (alive) setError(advancePaymentError(err));
      });
    return () => {
      alive = false;
    };
    // The bills are the request's and do not change while this is mounted;
    // joining them keeps the effect from re-running on a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, context.company, context.cardCode, context.bills.join(",")]);

  if (readOnly) {
    return (
      <Section icon="receipt-outline" title="TDS" defaultOpen={tds !== null}>
        <Text style={styles.read}>
          {tds
            ? `${formatINR(tds.amount)} deducted at ${tds.rate}% under ${
                tds.label || tds.code
              } (account ${tds.account}). The payee receives ${formatINR(
                requestAmount - tds.amount,
              )}.`
            : "No TDS deducted."}
        </Text>
      </Section>
    );
  }

  const blocked = options?.bills_with_tds ?? [];
  const rate = tds ? String(tds.rate) : "";
  const codes = options?.codes ?? [];
  const atRate = codes.filter((code) => code.rate === rate);
  const firstAt = (value_: string) => codes.find((code) => code.rate === value_) ?? null;

  /**
   * Take a code, and everything that comes with it: its rate, its account and
   * what the deduction amounts to.
   */
  const choose = (code: TdsCode | null) => {
    const amount = code ? tdsAmountFor(requestAmount, Number(code.rate)) : 0;
    const oldNet = requestAmount - (tds?.amount ?? 0);
    const newNet = requestAmount - amount;
    const lines =
      value.lines.length === 1 && Number(value.lines[0].amount) === oldNet
        ? [{ ...value.lines[0], amount: String(newNet) }]
        : value.lines;
    onChange({
      ...value,
      lines,
      tds: code
        ? {
            code: code.code,
            label: code.name,
            rate: Number(code.rate),
            account: code.account,
            amount,
          }
        : null,
    });
  };

  const unavailable = !options || blocked.length > 0 || (options?.rates.length ?? 0) === 0;

  return (
    <Section
      icon="receipt-outline"
      title="TDS"
      right={
        tds ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              {tds.rate}% · {formatINR(tds.amount)}
            </Text>
          </View>
        ) : undefined
      }
    >
      {error ? (
        <Notice tone="bad">
          <NoticeText tone="bad" text={error} />
        </Notice>
      ) : null}

      {blocked.length ? (
        <Notice tone="hold">
          <NoticeText
            tone="hold"
            text={`TDS cannot be deducted here: SAP already deducted it on ${blocked
              .map((bill) => `bill ${bill.doc_num ?? bill.doc_entry} (${formatINR(Number(bill.tds))})`)
              .join(", ")}.`}
          />
        </Notice>
      ) : null}

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.switchLabel}>Deduct TDS</Text>
          <Text style={styles.switchHint}>Booked to SAP at Final.</Text>
        </View>
        <Switch
          value={tds !== null}
          disabled={unavailable}
          onValueChange={(on) => choose(on ? firstAt(options?.rates[0] ?? "") : null)}
          trackColor={{ true: COLORS.primaryLight, false: COLORS.borderLight }}
          thumbColor={tds !== null ? COLORS.primary : COLORS.surface}
        />
      </View>

      {tds ? (
        <>
          <Select
            label="TDS Rate"
            required
            data={(options?.rates ?? []).map((value_) => ({
              label: `${value_}%`,
              value: value_,
            }))}
            value={rate}
            onChange={(picked) => choose(firstAt(picked))}
            placeholder="Select rate"
          />

          {/* THE SECTION IS WHAT FIXES THE ACCOUNT, so it is picked by name
              with its code beside it, and the vendor's own codes are marked. */}
          <Select
            label="TDS Section"
            required
            searchable
            data={atRate.map((code) => ({
              label: `${code.name} (${code.code})${code.assigned ? " · vendor's code" : ""}`,
              value: code.code,
            }))}
            value={tds.code}
            onChange={(picked) => choose(atRate.find((code) => code.code === picked) ?? null)}
            placeholder="Select section"
          />

          {/* THE TWO FIGURES THAT MATTER, spelt out: what is withheld, and
              what actually reaches the payee. */}
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Ionicons name="remove-circle-outline" size={14} color={COLORS.warning} />
              <Text style={styles.summaryLabel}>TDS withheld</Text>
              <Text style={styles.summaryValue}>{formatINR(tds.amount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="arrow-forward-circle-outline" size={14} color={COLORS.success} />
              <Text style={styles.summaryLabel}>Payee receives</Text>
              <Text style={styles.summaryValue}>{formatINR(requestAmount - tds.amount)}</Text>
            </View>
            <Text style={styles.account}>Booked to account {tds.account}</Text>
          </View>
        </>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  read: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: COLORS.warningLight,
  },
  tagText: { fontSize: 11, fontWeight: "800", color: COLORS.warning },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  // `minWidth: 0` so the hint wraps instead of pushing the switch off the card.
  switchText: { flex: 1, minWidth: 0 },
  switchLabel: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  switchHint: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 1, lineHeight: 14 },
  summary: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    gap: 6,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: { flex: 1, fontSize: 12, color: COLORS.textSecondary },
  summaryValue: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  account: { fontSize: 11, color: COLORS.textMuted },
});
