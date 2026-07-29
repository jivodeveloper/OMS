import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { formatAmount } from "../_lib/constants";
import type { PaymentMethodEntry } from "../_lib/types";

interface PaymentSummaryProps {
  methods: PaymentMethodEntry[];
}

/**
 * Fixed banner directly under the navbar. Styling is lifted from the Order
 * Details header (same gradient, padding and bottom-only 24pt corners) so it
 * reads as the same component sitting flush against the header.
 */
export default function PaymentSummary({ methods }: PaymentSummaryProps) {
  const total = methods.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.headerContent}>
        <View style={styles.headerTopRow}>
          <Text style={styles.totalAmount} numberOfLines={1}>
            ₹{formatAmount(total)}
          </Text>
          <View style={styles.statusPill}>
            <Ionicons name="wallet-outline" size={14} color={COLORS.primary} />
            <Text style={styles.statusPillText} numberOfLines={1}>
              {methods.length} {methods.length === 1 ? "Method" : "Methods"}
            </Text>
          </View>
        </View>

        <View style={styles.headerSecondRow}>
          <Text style={styles.totalLabel} numberOfLines={1}>
            TOTAL PAYMENT
          </Text>
          <View style={styles.stateRow}>
            <Ionicons name="checkmark-circle" size={14} color="#4ADE80" />
            <Text style={styles.stateText} numberOfLines={1}>
              Amount received
            </Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Matches orderdetails' `header` exactly — no top padding, so it sits flush
  // against the navbar with no gap.
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    width: "100%",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  totalAmount: {
    flex: 1,
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginRight: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  headerSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    flex: 1,
    color: "#fff",
    opacity: 0.95,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginRight: 10,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stateText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
