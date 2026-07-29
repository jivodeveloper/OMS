import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";

interface EmptyApprovalStateProps {
  /** Error variant when set; otherwise the plain "nothing found" variant. */
  error?: string | null;
  /** True when filters are narrowing the list, which changes the copy. */
  filtered?: boolean;
  onRetry?: () => void;
}

/**
 * Shared empty/error placeholder for the approvals list. Both variants live
 * here because they occupy the same slot and differ only in copy and affordance.
 */
export default function EmptyApprovalState({
  error,
  filtered = false,
  onRetry,
}: EmptyApprovalStateProps) {
  const isError = !!error;

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, isError && styles.iconCircleError]}>
        <Ionicons
          name={
            isError
              ? "cloud-offline-outline"
              : filtered
                ? "filter-outline"
                : "checkmark-done-circle-outline"
          }
          size={40}
          color={isError ? COLORS.error : COLORS.textMuted}
        />
      </View>

      <Text style={styles.title}>
        {isError ? "Something went wrong" : "No Requests Found"}
      </Text>

      <Text style={styles.subtitle}>
        {isError
          ? error
          : filtered
            ? "No approval requests match the current filters. Try changing the status or clearing the search."
            : "There are no approval requests to show right now."}
      </Text>

      {isError && onRetry ? (
        <TouchableOpacity
          style={styles.retryBtn}
          activeOpacity={0.85}
          onPress={onRetry}
        >
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconCircleError: {
    backgroundColor: COLORS.errorLight,
    borderColor: COLORS.errorBorder,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
