import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import type { ApprovalPayment, PaymentMethodType } from "../types";

interface PaymentAccordionProps {
  payment: ApprovalPayment;
  expanded: boolean;
  onToggle: () => void;
}

const METHOD_ICON: Record<PaymentMethodType, keyof typeof Ionicons.glyphMap> = {
  Cash: "cash-outline",
  UPI: "phone-portrait-outline",
  Cheque: "document-text-outline",
};

const formatAmount = (amount: number) =>
  amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * One expandable payment card. Collapsed it shows just method + amount; the
 * expanded body varies by method. The parent animates the height change, so
 * this component only decides what to render.
 */
function PaymentAccordion({ payment, expanded, onToggle }: PaymentAccordionProps) {
  const noteTotal =
    payment.noteRows?.reduce(
      (sum, row) => sum + row.denomination * row.quantity,
      0,
    ) ?? 0;
  const noteCount =
    payment.noteRows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.8}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${payment.type} payment`}
      >
        <View style={styles.iconBox}>
          <Ionicons name={METHOD_ICON[payment.type]} size={17} color={COLORS.primary} />
        </View>

        <Text style={styles.method}>{payment.type}</Text>

        <Text style={styles.amount}>₹{formatAmount(payment.amount)}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={17}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.divider} />

          <DetailRow label="Amount" value={`₹${formatAmount(payment.amount)}`} />

          {/* ── Cash ── */}
          {payment.type === "Cash" ? (
            <>
              <Text style={styles.subHeading}>Notes Breakdown</Text>
              {payment.noteRows?.map((row) => (
                <View key={row.denomination} style={styles.noteRow}>
                  <Text style={styles.noteLabel}>
                    ₹{row.denomination} × {row.quantity}
                  </Text>
                  <Text style={styles.noteValue}>
                    ₹{formatAmount(row.denomination * row.quantity)}
                  </Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Notes ({noteCount})</Text>
                <Text style={styles.totalValue}>₹{formatAmount(noteTotal)}</Text>
              </View>
              {payment.remarks ? (
                <DetailRow label="Remarks" value={payment.remarks} stacked />
              ) : null}
            </>
          ) : null}

          {/* ── UPI ── */}
          {payment.type === "UPI" ? (
            <DetailRow
              label="UPI Reference Number"
              value={payment.upiReference ?? "—"}
            />
          ) : null}

          {/* ── Cheque ── */}
          {payment.type === "Cheque" ? (
            <>
              <DetailRow label="Cheque Number" value={payment.chequeNumber ?? "—"} />
              <DetailRow label="Bank Name" value={payment.bankName ?? "—"} />
              <DetailRow label="Cheque Date" value={payment.chequeDate ?? "—"} />
            </>
          ) : null}

          {/* Proof preview — placeholder tile, no real image in this phase. */}
          {payment.attachment ? (
            <View style={styles.previewWrap}>
              <Text style={styles.subHeading}>
                {payment.type === "UPI" ? "Screenshot" : "Cheque Image"}
              </Text>
              <View style={styles.previewRow}>
                <View style={styles.previewThumb}>
                  <Ionicons name="image-outline" size={20} color={COLORS.textMuted} />
                </View>
                <View style={styles.previewText}>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {payment.attachment.name}
                  </Text>
                  <Text style={styles.previewSize}>{payment.attachment.size}</Text>
                </View>
                <TouchableOpacity style={styles.previewBtn} activeOpacity={0.8}>
                  <Ionicons name="eye-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.previewBtnText}>View</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Label/value pair; `stacked` puts the value on its own line for long text. */
function DetailRow({
  label,
  value,
  stacked = false,
}: {
  label: string;
  value: string;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <View style={styles.stackedRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.stackedValue}>{value}</Text>
      </View>
    );
  }

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default React.memo(PaymentAccordion);

const styles = StyleSheet.create({
  // Mirrors the Order Details item accordion.
  card: {
    borderWidth: 1,
    borderColor: "#EAEEF5",
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#FCFDFF",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  method: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#EAEEF5",
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 5,
  },
  stackedRow: {
    paddingVertical: 5,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
  stackedValue: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.text,
    marginTop: 3,
  },
  subHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 6,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  noteLabel: {
    fontSize: 12,
    color: COLORS.text,
  },
  noteValue: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#EAEEF5",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  totalValue: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  previewWrap: {
    marginTop: 4,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    padding: 8,
  },
  previewThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  previewText: {
    flex: 1,
  },
  previewName: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  previewSize: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  previewBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
});
