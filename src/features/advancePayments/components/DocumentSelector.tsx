import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";

import { QUICK_PERCENTAGES, type OpenDocument } from "../logic/constants";
import {
  REFERENCE_KINDS,
  allocationRows,
  allocationTotals,
  formatDate,
  formatINR,
  type Allocation,
  type AllocationRow,
  type ReferenceKind,
  type RequestForm,
} from "../logic/rules";
import { Card, Notice, NoticeText } from "./AdvanceUi";

/**
 * The documents a payment is made against, and what is being paid on each.
 *
 * COLLAPSED BY DEFAULT. A vendor can have thirty open bills, and thirty rows
 * above the rest of the form buries it; the header carries the count and how
 * much has been allocated, which is what a requester checks after picking, and
 * opens the list when they want to change it.
 *
 * ONE BOX PER LINE. The mode lives INSIDE the amount box as a small picker: "₹"
 * means type the figure, a percentage means it is worked out from the open
 * amount and shown in the same box. Both come out of the OPEN amount, which is
 * the whole point — 50% of a ₹2,50,000 bill with ₹1,00,000 already paid is
 * ₹75,000, not ₹1,25,000. The arithmetic is `logic/rules`, shared with the web.
 *
 * A BILL IS PAID BY AMOUNT ONLY, so its box has no picker: that is the server's
 * rule too (`a bill is paid by amount only`), and offering a percentage here
 * would only earn a refusal on submit.
 */
export default function DocumentSelector({
  kind,
  form,
  documents,
  loading,
  error,
  onPick,
  onAllocationChange,
}: {
  kind: ReferenceKind;
  form: RequestForm;
  documents: OpenDocument[];
  loading: boolean;
  error: string;
  onPick: (ids: string[]) => void;
  onAllocationChange: (id: string, patch: Partial<Allocation>) => void;
}) {
  const def = REFERENCE_KINDS[kind];
  const rows = allocationRows(form);
  const totals = allocationTotals(rows);
  const chosen = new Set(form.selected.map((doc) => doc.id));
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onPick(
      chosen.has(id)
        ? form.selected.filter((doc) => doc.id !== id).map((doc) => doc.id)
        : [...form.selected.map((doc) => doc.id), id],
    );
  };

  const picked = form.selected.length;
  const summary = !form.partner
    ? "Pick the business partner first"
    : loading
      ? "Reading from SAP…"
      : picked === 0
        ? `${documents.length} open · none selected`
        : `${picked} selected · ${formatINR(totals.payment)}`;

  return (
    <Card>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((current) => !current)}
        activeOpacity={0.7}
      >
        <View style={styles.headerIcon}>
          <Ionicons name="documents-outline" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle}>{def.pluralLabel}</Text>
          <Text style={styles.headerSummary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        {picked > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{picked}</Text>
          </View>
        ) : null}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {open ? (
        <View style={styles.body}>
          {!form.partner ? (
            <Notice tone="info">
              <NoticeText tone="info" text="Pick the business partner first." />
            </Notice>
          ) : loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>
                Reading open {def.pluralLabel.toLowerCase()} from SAP…
              </Text>
            </View>
          ) : error ? (
            <Notice tone="bad">
              <NoticeText tone="bad" text={error} />
            </Notice>
          ) : documents.length === 0 ? (
            <Notice tone="hold">
              <NoticeText
                tone="hold"
                text={`This partner has no open ${def.pluralLabel.toLowerCase()} in SAP.`}
              />
            </Notice>
          ) : (
            documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                kind={kind}
                picked={chosen.has(document.id)}
                row={rows.find((candidate) => candidate.document.id === document.id)}
                onToggle={() => toggle(document.id)}
                onAllocationChange={(patch) => onAllocationChange(document.id, patch)}
              />
            ))
          )}
        </View>
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.total}>
          <Text style={styles.totalLabel}>
            {rows.length} {rows.length === 1 ? def.noun : `${def.noun}s`} · open{" "}
            {formatINR(totals.open)}
          </Text>
          <Text style={[styles.totalValue, !totals.complete && styles.totalValueOff]}>
            {formatINR(totals.payment)}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** One document: what it is, and — once ticked — what is being paid on it. */
function DocumentRow({
  document,
  kind,
  picked,
  row,
  onToggle,
  onAllocationChange,
}: {
  document: OpenDocument;
  kind: ReferenceKind;
  picked: boolean;
  row: AllocationRow | undefined;
  onAllocationChange: (patch: Partial<Allocation>) => void;
  onToggle: () => void;
}) {
  const def = REFERENCE_KINDS[kind];
  const canPercent = def.modes.includes("PERCENT");

  return (
    <View style={[styles.doc, picked && styles.docPicked]}>
      <TouchableOpacity style={styles.docHead} onPress={onToggle} activeOpacity={0.7}>
        <Ionicons
          name={picked ? "checkbox" : "square-outline"}
          size={20}
          color={picked ? COLORS.primary : COLORS.textMuted}
        />
        <View style={styles.docBody}>
          <Text style={styles.docNumber}>
            {def.label} {document.number}
            {document.docType ? ` · ${document.docType}` : ""}
          </Text>
          <Text style={styles.docMeta}>
            {formatDate(document.date)}
            {document.reference ? ` · ${document.reference}` : ""}
          </Text>
          <Text style={styles.docMeta}>
            {def.originalLabel} {formatINR(document.original)} · {def.paidLabel}{" "}
            {formatINR(document.paid)}
          </Text>
          <Text style={styles.docOpen}>Open {formatINR(document.open)}</Text>
          {document.note ? <Text style={styles.docNote}>{document.note}</Text> : null}
        </View>
      </TouchableOpacity>

      {picked && row ? (
        <View style={styles.line}>
          <AmountBox
            row={row}
            kind={kind}
            canPercent={canPercent}
            onAllocationChange={onAllocationChange}
          />
          {row.calc.error ? <Text style={styles.lineError}>{row.calc.error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The one box a line is paid from.
 *
 * The picker sits inside the box, on the left. On "₹" the figure is typed; on a
 * percentage the box shows what that percentage of the open amount comes to and
 * is read-only, because the figure is worked out and typing over it would leave
 * the two disagreeing.
 */
function AmountBox({
  row,
  kind,
  canPercent,
  onAllocationChange,
}: {
  row: AllocationRow;
  kind: ReferenceKind;
  canPercent: boolean;
  onAllocationChange: (patch: Partial<Allocation>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const percent = row.allocation.mode === "PERCENT";
  const invalid = Boolean(row.calc.error);

  const shown = percent
    ? row.calc.payment !== null
      ? formatINR(row.calc.payment)
      : ""
    : row.allocation.amount;

  return (
    <>
      <View style={[styles.amountBox, invalid && styles.amountBoxInvalid]}>
        {canPercent ? (
          <TouchableOpacity
            style={styles.modeChip}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.modeChipText}>
              {percent ? `${row.allocation.percentage || "0"}%` : "₹"}
            </Text>
            <Ionicons name="chevron-down" size={13} color={COLORS.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.modeChipStatic}>
            <Text style={styles.modeChipText}>₹</Text>
          </View>
        )}

        <TextInput
          style={[styles.amountInput, percent && styles.amountInputDerived]}
          value={shown}
          onChangeText={(amount) => onAllocationChange({ amount })}
          editable={!percent}
          placeholder={percent ? "Pick a percentage" : `Up to ${formatINR(row.document.open)}`}
          placeholderTextColor={COLORS.textMuted}
          keyboardType="decimal-pad"
        />
      </View>

      {/* The picker: "₹" or one of the set percentages, in one short list. */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.menuTitle}>
              {REFERENCE_KINDS[kind].label} {row.document.number} · open{" "}
              {formatINR(row.document.open)}
            </Text>
            <TouchableOpacity
              style={[styles.menuRow, !percent && styles.menuRowActive]}
              onPress={() => {
                onAllocationChange({ mode: "FIXED" });
                setMenuOpen(false);
              }}
            >
              <Text style={[styles.menuRowText, !percent && styles.menuRowTextActive]}>
                ₹ Type the amount
              </Text>
              {!percent ? (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              ) : null}
            </TouchableOpacity>
            {QUICK_PERCENTAGES.map((value) => {
              const active = percent && row.allocation.percentage === String(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.menuRow, active && styles.menuRowActive]}
                  onPress={() => {
                    onAllocationChange({ mode: "PERCENT", percentage: String(value) });
                    setMenuOpen(false);
                  }}
                >
                  <Text style={[styles.menuRowText, active && styles.menuRowTextActive]}>
                    {value}% of the open amount
                  </Text>
                  <Text style={styles.menuRowWorth}>
                    {formatINR(Math.round(((row.document.open * value) / 100) * 100) / 100)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBody: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  headerSummary: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  countPill: {
    minWidth: 24,
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countPillText: { fontSize: 12, fontWeight: "800", color: COLORS.textLight },

  body: { marginTop: SPACING.sm },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  loadingText: { fontSize: 12, color: COLORS.textSecondary },

  doc: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginTop: SPACING.sm,
  },
  docPicked: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLighter },
  docHead: { flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start" },
  docBody: { flex: 1, minWidth: 0 },
  docNumber: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  docMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  docOpen: { fontSize: 13, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  docNote: { fontSize: 11, color: COLORS.warning, fontWeight: "700", marginTop: 2 },

  line: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  lineError: { fontSize: 11, color: COLORS.error, fontWeight: "600", marginTop: 4 },

  // One bordered box holding the picker and the figure.
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    gap: 6,
  },
  amountBoxInvalid: { borderColor: COLORS.error },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: 62,
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  modeChipStatic: {
    minWidth: 34,
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  modeChipText: { fontSize: 13, fontWeight: "800", color: COLORS.primary },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    paddingVertical: 0,
  },
  amountInputDerived: { color: COLORS.success },

  total: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600" },
  totalValue: { fontSize: 17, fontWeight: "800", color: COLORS.success },
  totalValueOff: { color: COLORS.warning },

  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  menu: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm,
  },
  menuRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLighter },
  menuRowText: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  menuRowTextActive: { color: COLORS.primary, fontWeight: "800" },
  menuRowWorth: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
});
