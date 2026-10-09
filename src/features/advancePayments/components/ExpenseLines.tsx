import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { AdvancePaymentCompany, TdsCode } from "@/src/services/advancePayment.service";

import { useExpenseAccounts, useExpenseMonths } from "../hooks/useAdvanceMasters";
import { GST_OPTIONS, type GstCode } from "../logic/constants";
import {
  MAX_EXPENSE_LINES,
  NO_TDS,
  expenseNet,
  expenseTds,
  expenseTotal,
  formatINR,
  lineGst,
  lineInvoice,
  lineTaxable,
  lineTds,
  newExpenseLine,
  plainAmountError,
  type ExpenseLineForm,
  type RequestForm,
} from "../logic/rules";
import { Card, Field, Input, Notice, NoticeText, Row, Select } from "./AdvanceUi";

/**
 * An Expense request's own section — the web's `ExpenseDetails`, in this app's
 * controls.
 *
 * AN EXPENSE PAYS G/L ACCOUNTS, NOT A DOCUMENT. There is no bill and no PO:
 * each line is an amount to an expense account, and the lines together are
 * what the request is worth. The arithmetic (taxable, GST, TDS, net) is the
 * shared `logic/rules`, so a line adds up here exactly as it does on the web
 * and as the server will recompute it.
 *
 * TWO READERS, ONE COMPONENT. A REQUESTER gives each line's amount and its
 * G/L — or ticks that they do not know it and says what it is for instead, and
 * the Payment desk picks the account. THE DESK (`atPayment`) cannot touch the
 * amounts, which are the request as approved, and adds what only it sets: the
 * G/L, the GST (how much of the amount is tax), the month and the TDS.
 */

/** The desk's TDS: SAP's codes, and the rate of one. */
export interface ExpenseTds {
  codes: TdsCode[];
  rateOf: (code: string) => number | null;
  loading?: boolean;
  error?: string;
}

const tdsLabel = (code: TdsCode) => `${code.name || code.code} (${Number(code.rate)}%)`;

/** "10-2026" -> "Oct 2026". */
export function monthLabel(code: string): string {
  const [month, year] = code.split("-");
  const when = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(when.getTime()) || !year
    ? code
    : when.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** A figure the reader cannot change — an amount the desk must not edit. */
function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={[styles.figureValue, strong && styles.figureStrong]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function ExpenseLines({
  company,
  form,
  onChange,
  atPayment = false,
  tds,
  showErrors = false,
}: {
  company: AdvancePaymentCompany | "";
  form: RequestForm;
  onChange: (patch: Partial<RequestForm>) => void;
  /** The Payment desk: amounts fixed; G/L, GST, month and TDS its own. */
  atPayment?: boolean;
  /** The desk's TDS codes (with `atPayment`). */
  tds?: ExpenseTds;
  showErrors?: boolean;
}) {
  const accounts = useExpenseAccounts(company);
  // The months are the desk's question: a requester's lines take the request's.
  const months = useExpenseMonths(company, atPayment);

  const lines = form.expenseLines;
  const setLine = (id: string, patch: Partial<ExpenseLineForm>) =>
    onChange({
      expenseLines: lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });

  const rateOf = atPayment ? tds?.rateOf : undefined;
  const codes = tds?.codes ?? [];
  const requestTds = codes.find((code) => code.code === form.expenseTdsCode);
  const lookupError = accounts.error || months.error || undefined;

  /**
   * A month SAP no longer lists, kept on the list: a request saved under it
   * must not silently lose it when the window moves on.
   */
  const monthChoices = [
    ...new Set([...months.months, form.effectMonth, ...lines.map((line) => line.effectMonth)]),
  ].filter(Boolean);

  const glPicker = (line: ExpenseLineForm, index: number) => (
    <Select
      label="G/L Account"
      required
      searchable
      searchPlaceholder="Search account or name"
      data={accounts.optionsFor(line.glAccount, line.glName)}
      value={line.glAccount}
      onChange={(code) => setLine(line.id, { glAccount: code, glName: accounts.nameOf(code) })}
      placeholder={
        !company
          ? "Pick a company first"
          : accounts.loading
            ? "Loading accounts…"
            : "Choose the G/L account"
      }
      disabled={!company}
      error={
        accounts.error ||
        (showErrors && !line.glAccount && (atPayment || !line.glUnknown)
          ? `G/L account on line ${index + 1} is required.`
          : undefined)
      }
    />
  );

  return (
    <Card
      title="Expense"
      subtitle={
        atPayment
          ? "The amounts are the request's. Set each line's account, GST, month and TDS."
          : "Each line: its amount and G/L account. Don't know the account? Say what it is for instead — the Payment desk picks it."
      }
    >
      {atPayment ? (
        <Row>
          <Select
            label="Month"
            required
            data={monthChoices.map((code) => ({
              label: monthLabel(code),
              value: code,
              hint: code,
            }))}
            value={form.effectMonth}
            onChange={(effectMonth) => onChange({ effectMonth })}
            placeholder={months.loading ? "Loading months…" : "Select month"}
            disabled={!company}
            error={months.error || undefined}
          />
          <Select
            label="TDS"
            data={[
              { label: "No TDS", value: "" },
              ...codes.map((code) => ({ label: tdsLabel(code), value: code.code })),
            ]}
            value={form.expenseTdsCode}
            onChange={(expenseTdsCode) => onChange({ expenseTdsCode })}
            placeholder={tds?.loading ? "Loading TDS codes…" : "No TDS"}
            error={tds?.error}
          />
        </Row>
      ) : null}

      {/* THE ELECTRICITY TOGGLE IS GONE, as it is on the web (2026-10-09).
          It used to split the Expense workflows — plain and electricity — and
          it no longer does: the Director approves either way. A flag that
          changes nothing is a question not worth asking, and one that claimed
          to change the route was worse than nothing. Older requests keep
          whatever they were saved with, and the details page still shows it. */}

      <View style={styles.linesWrap}>
      {lines.map((line, index) => {
        const n = index + 1;
        const amountError = plainAmountError(line.amount)
          ? "Enter an amount above zero."
          : showErrors && !line.amount
            ? "Amount is required."
            : undefined;
        const deducted = lineTds(line, form, rateOf);

        return (
          <View key={line.id} style={styles.lineBox}>
            <View style={styles.lineHead}>
              <Text style={styles.lineTitle}>Line {n}</Text>
              {/* Only the requester may drop a line: at the desk the lines are
                  what was approved. */}
              {!atPayment && lines.length > 1 ? (
                <TouchableOpacity
                  onPress={() =>
                    onChange({ expenseLines: lines.filter((row) => row.id !== line.id) })
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove line ${n}`}
                >
                  <Ionicons name="trash-outline" size={ms(16)} color={COLORS.error} />
                </TouchableOpacity>
              ) : null}
            </View>

            {atPayment ? (
              <>
                <View style={styles.figureRow}>
                  <Figure label="Amount" value={formatINR(lineInvoice(line))} strong />
                  <Figure label="TDS" value={formatINR(deducted)} />
                  <Figure label="Paid" value={formatINR(lineInvoice(line) - deducted)} strong />
                </View>

                <Row>
                  <Select
                    label="GST"
                    data={GST_OPTIONS.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    value={line.gstCode}
                    onChange={(gstCode) => setLine(line.id, { gstCode: gstCode as GstCode })}
                  />
                  <Select
                    label="Line TDS"
                    data={[
                      {
                        label: requestTds ? `Request's (${tdsLabel(requestTds)})` : "Request's (none)",
                        value: "",
                      },
                      { label: "No TDS", value: NO_TDS },
                      ...codes.map((code) => ({ label: tdsLabel(code), value: code.code })),
                    ]}
                    value={line.tdsOverride}
                    onChange={(tdsOverride) => setLine(line.id, { tdsOverride })}
                  />
                </Row>
                <Text style={styles.lineNote}>
                  Taxable {formatINR(lineTaxable(line))} · GST {formatINR(lineGst(line))}
                </Text>

                {glPicker(line, index)}

                <Select
                  label="Line Month"
                  data={[
                    {
                      label: form.effectMonth
                        ? `Request's (${monthLabel(form.effectMonth)})`
                        : "Request's month",
                      value: "",
                    },
                    ...monthChoices.map((code) => ({ label: monthLabel(code), value: code })),
                  ]}
                  value={line.effectMonth}
                  onChange={(effectMonth) => setLine(line.id, { effectMonth })}
                />

                <Field label="Line Remarks">
                  <Input
                    value={line.remarks}
                    onChangeText={(remarks) => setLine(line.id, { remarks })}
                    placeholder="Anything about this line"
                    maxLength={254}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Amount" required error={amountError}>
                  <Input
                    value={line.amount}
                    onChangeText={(amount) => setLine(line.id, { amount })}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    prefix="₹"
                    invalid={Boolean(amountError)}
                  />
                </Field>

                {line.glUnknown ? (
                  <Field
                    label="What is it for?"
                    required
                    error={
                      showErrors && !line.remarks.trim()
                        ? `Remarks on line ${n} are required.`
                        : undefined
                    }
                  >
                    <Input
                      value={line.remarks}
                      onChangeText={(remarks) => setLine(line.id, { remarks })}
                      placeholder="e.g. Diesel for the factory generator, September"
                      maxLength={254}
                      multiline
                      invalid={showErrors && !line.remarks.trim()}
                    />
                  </Field>
                ) : (
                  glPicker(line, index)
                )}

                {/* ONE OR THE OTHER: an account, or what it is for. Ticking
                    this clears the account, so a line never carries both and
                    the desk is never told two different things. */}
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text style={styles.switchLabel}>I don&apos;t know the G/L account</Text>
                    <Text style={styles.switchHint}>
                      Say what it is for instead: the Payment desk picks the account.
                    </Text>
                  </View>
                  <Switch
                    value={line.glUnknown}
                    onValueChange={(glUnknown) =>
                      setLine(line.id, {
                        glUnknown,
                        ...(glUnknown ? { glAccount: "", glName: "" } : { remarks: "" }),
                      })
                    }
                    trackColor={{ true: COLORS.primaryLight, false: COLORS.borderLight }}
                    thumbColor={line.glUnknown ? COLORS.primary : COLORS.surface}
                  />
                </View>
              </>
            )}
          </View>
        );
      })}

      </View>

      {!atPayment ? (
        <TouchableOpacity
          style={[styles.addBtn, lines.length >= MAX_EXPENSE_LINES && styles.addBtnOff]}
          onPress={() => onChange({ expenseLines: [...lines, newExpenseLine()] })}
          disabled={lines.length >= MAX_EXPENSE_LINES}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={lines.length >= MAX_EXPENSE_LINES ? COLORS.textMuted : COLORS.primary}
          />
          <Text
            style={[styles.addText, lines.length >= MAX_EXPENSE_LINES && styles.addTextOff]}
          >
            {lines.length >= MAX_EXPENSE_LINES
              ? `At most ${MAX_EXPENSE_LINES} lines`
              : "Add line"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* WHAT IT COMES TO. At the desk the three figures differ — the request
          is the invoice values, the payment is those less TDS. */}
      <View style={styles.totalBox}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatINR(expenseTotal(lines))}</Text>
        </View>
        {atPayment ? (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TDS</Text>
              <Text style={styles.totalMinor}>- {formatINR(expenseTds(form, rateOf))}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalRowTop]}>
              <Text style={styles.totalLabelStrong}>Paid</Text>
              <Text style={styles.totalValueStrong}>{formatINR(expenseNet(form, rateOf))}</Text>
            </View>
          </>
        ) : null}
      </View>

      {lookupError ? (
        <Notice tone="bad">
          <NoticeText tone="bad" text={lookupError} />
        </Notice>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  // The run of boxes, held off whatever is above it (the card's own heading,
  // or the desk's Month and TDS row).
  linesWrap: { marginTop: sp(14) },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(8),
  },
  // `minWidth: 0` so a long hint wraps rather than pushing the switch off.
  switchText: { flex: 1, minWidth: 0 },
  switchLabel: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  switchHint: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 2 },

  /*
   * THE LINE BOXES, AND THE AIR AROUND THEM.
   *
   * A box inside a card is two borders deep, so it has to be spaced from its
   * neighbours by MORE than its own padding, or the whole column reads as one
   * grey slab. One scale throughout: 14 inside the box, 14 between boxes.
   *
   * The top is 12 and the bottom 14 ON PURPOSE, not by accident: every control
   * carries `marginTop: 16` of its own (`AdvanceUi.Field`), so the first one
   * already sits well clear of the heading while the last one has nothing
   * under it. Equal padding both ends is what made the old boxes read
   * top-light and bottom-heavy.
   */
  lineBox: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(14),
    backgroundColor: COLORS.background,
    paddingHorizontal: sp(14),
    paddingTop: sp(12),
    // The last control's own 16pt top margin is the gap above; this is the
    // gap below it, so the box is evenly padded without doubling anything.
    paddingBottom: sp(14),
    marginBottom: sp(14),
  },
  // Flush with the box's top padding: the heading is the only child with no
  // margin of its own, and the divider under it does the separating.
  lineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: sp(10),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  lineTitle: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.primary },
  lineNote: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: sp(6) },

  figureRow: { flexDirection: "row", gap: sp(10), marginTop: sp(12) },
  figure: { flex: 1, minWidth: 0 },
  figureLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  figureValue: { fontSize: fs(13), color: COLORS.text, marginTop: 2 },
  figureStrong: { fontWeight: "800" },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    // The last box already ends 14 below its content; this is the gap between
    // that edge and the button, so adding a line reads as the next step rather
    // than part of the box above it.
    marginTop: sp(2),
    paddingVertical: sp(12),
    borderRadius: sp(12),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.borderBlue,
    backgroundColor: COLORS.primaryLighter,
  },
  addBtnOff: { borderColor: COLORS.borderLight, backgroundColor: COLORS.background },
  addText: { fontSize: fs(13), fontWeight: "800", color: COLORS.primary },
  addTextOff: { color: COLORS.textMuted },

  totalBox: {
    marginTop: sp(16),
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: sp(6),
  },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalRowTop: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: sp(6) },
  totalLabel: { fontSize: fs(12.5), color: COLORS.textSecondary },
  totalLabelStrong: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  totalValue: { fontSize: fs(13.5), fontWeight: "800", color: COLORS.text },
  totalValueStrong: { fontSize: fs(15), fontWeight: "900", color: COLORS.primary },
  totalMinor: { fontSize: fs(12.5), color: COLORS.textSecondary },
});
