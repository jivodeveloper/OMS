import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { appAlert } from "@/src/components/common/AppDialog";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import { advancePaymentService, type ApiRequest } from "@/src/services/advancePayment.service";

import { showFailure } from "../showError";

import { useBudgets, useTdsCodes } from "../hooks/useAdvanceMasters";
import { GST_OPTIONS } from "../logic/constants";
import { expenseEditToApi, fromApiRequest } from "../logic/requestApi";
import {
  applyChange,
  expenseNet,
  expenseTds,
  expenseTotal,
  formatINR,
  lineGst,
  lineInvoice,
  lineTaxable,
  lineTds,
  validateExpense,
  type RequestForm,
} from "../logic/rules";
import { Notice, NoticeText, Select } from "./AdvanceUi";
import ExpenseLines, { monthLabel } from "./ExpenseLines";

/**
 * An Expense request's lines on the details page — read, and at Payment,
 * corrected.
 *
 * READ-ONLY FOR EVERY APPROVER. The lines ARE the request: there is no bill
 * and no PO to show, so an approver who cannot see them is being asked to
 * approve an amount with nothing behind it. A line the requester could not
 * account for says so ("Payment desk to choose") rather than showing a blank.
 *
 * THE PAYMENT DESK CORRECTS IT HERE. It sets the Sub Budget, the Month, the
 * TDS and each line's G/L — never an amount, which is what was approved; the
 * server refuses that outright and says to return the request instead.
 */

/** One fact of a line, in the two-column grid the details page uses. */
function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue} numberOfLines={2}>
        {value}
      </Text>
      {sub ? (
        <Text style={styles.cellSub} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export default function ExpenseCard({
  request,
  form,
  canEdit,
  onSaved,
}: {
  request: ApiRequest;
  /** The request as the form holds it (`fromApiRequest`). */
  form: RequestForm;
  /** The Payment stage: the desk may correct it. */
  canEdit: boolean;
  onSaved: (saved: ApiRequest) => void;
}) {
  /**
   * THE DRAFT IS THE DESK'S ALONE. Until it saves, the request on screen stays
   * what the approvers decided; a half-set G/L must not read as the request.
   */
  const [draft, setDraft] = useState<RequestForm | null>(null);
  const [saving, setSaving] = useState(false);
  const budgets = useBudgets(form.company);
  const tds = useTdsCodes(form.company, form.partner, canEdit);

  const editing = canEdit && draft !== null;
  const shown = draft ?? form;
  const lines = shown.expenseLines;

  const missing = useMemo(
    () => form.expenseLines.filter((line) => !line.glAccount).length,
    [form.expenseLines],
  );

  if (form.type !== "EXPENSE") return null;

  const save = async () => {
    if (!draft) return;
    const problems = validateExpense(draft, { atPayment: true });
    if (problems.missing.length || problems.problems.length) {
      appAlert(
        "Not yet",
        [
          ...problems.problems,
          ...(problems.missing.length ? [`Still needed: ${problems.missing.join(", ")}.`] : []),
        ].join("\n"),
      );
      return;
    }
    setSaving(true);
    try {
      const saved = await advancePaymentService.editExpense(
        request.id,
        expenseEditToApi(draft),
        request.flow?.version,
      );
      onSaved(saved);
      // Re-read from what the server answered: it recomputes every taxable
      // amount, every TDS and the month each line posts to.
      setDraft(null);
      appAlert("Saved", "The expense request has been corrected.");
    } catch (err) {
      // EVERY reason, in the server's own words: `errors.problems` name the
      // line — "Line 2: 5670001 is not an expense account in SAP." — and the
      // headline alone would send the desk looking through nine lines for it.
      showFailure("Could not save the expense", err);
      console.warn("[advance-payments] expense edit refused", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerIcon}>
          <Ionicons name="receipt" size={ms(16)} color={COLORS.primary} />
        </View>
        <Text style={styles.cardTitle}>
          Expense Lines{lines.length > 1 ? ` (${lines.length})` : ""}
        </Text>
        {canEdit && !editing ? (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setDraft(form)}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={ms(14)} color={COLORS.primary} />
            <Text style={styles.editText}>Correct</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* WHAT THE DESK STILL HAS TO DO, said before the lines rather than
          discovered line by line. */}
      {missing && !editing ? (
        <Notice tone="hold">
          <NoticeText
            tone="hold"
            text={
              missing === 1
                ? "1 line has no G/L account — the Payment desk picks it."
                : `${missing} lines have no G/L account — the Payment desk picks them.`
            }
          />
        </Notice>
      ) : null}

      {editing ? (
        <>
          {/* THE SUB BUDGET IS THE DESK'S: every expense line in SAP carries
              one, and the requester is not asked for it. */}
          <Select
            label="Sub Budget"
            required
            searchable
            data={budgets.optionsFor("SUB_BUDGET", shown.subBudget, shown.subBudgetName)}
            value={shown.subBudget}
            onChange={(value) =>
              setDraft(
                applyChange(shown, {
                  subBudget: value,
                  subBudgetName:
                    budgets
                      .optionsFor("SUB_BUDGET", "", "")
                      .find((option) => option.value === value)?.label ?? "",
                }),
              )
            }
            placeholder={budgets.loading ? "Loading sub budgets…" : "Select sub budget"}
            error={budgets.error || undefined}
          />

          <ExpenseLines
            company={shown.company}
            form={shown}
            onChange={(patch) => setDraft(applyChange(shown, patch))}
            atPayment
            tds={{
              codes: tds.codes,
              rateOf: tds.rateOf,
              loading: tds.loading,
              error: tds.error || undefined,
            }}
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setDraft(null)}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnOff]}
              onPress={() => void save()}
              disabled={saving}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save Expense Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          {lines.map((line, index) => {
            const month = line.effectMonth || shown.effectMonth;
            const deducted = lineTds(line, shown);
            const gst = GST_OPTIONS.find((option) => option.value === line.gstCode);
            return (
              <View key={line.id} style={[styles.line, index > 0 && styles.lineBordered]}>
                <View style={styles.lineHead}>
                  <Text style={styles.lineNo}>Line {index + 1}</Text>
                  <Text style={styles.lineAmount}>{formatINR(lineInvoice(line))}</Text>
                </View>

                <View style={styles.grid}>
                  <Cell
                    label="G/L Account"
                    value={line.glAccount || "Payment desk to choose"}
                    sub={line.glName || undefined}
                  />
                  <Cell
                    label="Month"
                    value={month ? monthLabel(month) : "Payment desk to set"}
                    sub={line.effectMonth && line.effectMonth !== shown.effectMonth ? "This line's own" : undefined}
                  />
                </View>

                {line.gstCode || deducted ? (
                  <View style={styles.grid}>
                    <Cell
                      label="GST"
                      value={gst?.label ?? line.gstCode ?? "—"}
                      sub={
                        line.gstCode
                          ? `Taxable ${formatINR(lineTaxable(line))} · GST ${formatINR(lineGst(line))}`
                          : undefined
                      }
                    />
                    <Cell
                      label="TDS · Paid"
                      value={`${formatINR(deducted)} · ${formatINR(lineInvoice(line) - deducted)}`}
                      sub={deducted ? line.tdsCode || undefined : undefined}
                    />
                  </View>
                ) : null}

                {line.remarks ? (
                  <Text style={styles.lineRemarks} numberOfLines={3}>
                    {line.remarks}
                  </Text>
                ) : null}
              </View>
            );
          })}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatINR(expenseTotal(lines))}</Text>
            </View>
            {expenseTds(shown) ? (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>TDS</Text>
                  <Text style={styles.totalLabel}>- {formatINR(expenseTds(shown))}</Text>
                </View>
                <View style={[styles.totalRow, styles.totalRowTop]}>
                  <Text style={styles.totalStrong}>Paid</Text>
                  <Text style={styles.totalStrongValue}>{formatINR(expenseNet(shown))}</Text>
                </View>
              </>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/** The request as the form holds it — the details screen already has one. */
export { fromApiRequest };

const styles = StyleSheet.create({
  /**
   * THE DETAIL PAGE'S CARD, to the pixel (`AdvanceDetailsScreen.styles.card`).
   * Without the side margin it ran edge to edge while Payment Summary above it
   * sat inside a 14pt gutter, and read as a different kind of box.
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
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: sp(8), marginBottom: sp(14) },
  headerIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  // `minWidth: 0` so the Correct button keeps its place beside a long title.
  cardTitle: { flex: 1, minWidth: 0, fontSize: fs(15), fontWeight: "700", color: COLORS.text },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(4),
    paddingHorizontal: sp(10),
    paddingVertical: sp(6),
    borderRadius: 999,
    backgroundColor: COLORS.primaryLighter,
  },
  editText: { fontSize: fs(11.5), fontWeight: "800", color: COLORS.primary },

  line: { paddingVertical: sp(10) },
  lineBordered: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  lineHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineNo: { fontSize: fs(12), fontWeight: "800", color: COLORS.textSecondary },
  lineAmount: { fontSize: fs(14), fontWeight: "900", color: COLORS.text },
  lineRemarks: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: sp(6) },

  grid: { flexDirection: "row", gap: sp(12), marginTop: sp(8) },
  cell: { flex: 1, minWidth: 0 },
  cellLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  cellValue: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.text, marginTop: 1 },
  cellSub: { fontSize: fs(11), color: COLORS.textMuted, marginTop: 1 },

  totals: { marginTop: sp(10), borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: sp(8), gap: sp(4) },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalRowTop: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: sp(6) },
  totalLabel: { fontSize: fs(12.5), color: COLORS.textSecondary },
  totalValue: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },
  totalStrong: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  totalStrongValue: { fontSize: fs(15), fontWeight: "900", color: COLORS.primary },

  actions: { flexDirection: "row", gap: sp(10), marginTop: sp(10) },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: ms(42),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cancelText: { fontSize: fs(13), fontWeight: "700", color: COLORS.textSecondary },
  saveBtn: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    height: ms(42),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  saveBtnOff: { opacity: 0.7 },
  saveText: { fontSize: fs(13), fontWeight: "800", color: "#fff" },
});
