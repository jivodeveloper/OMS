import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

/**
 * "A remark is required for this." — the line under the remarks box.
 *
 * ONE COPY OF IT, because there were two. The advance payment decision dialog
 * and the shared reject dialog each carried their own styles for this row, and
 * they had already drifted: different inset, different weight, different
 * spacing above. Two dialogs built from the same pieces then did not look the
 * same at the one moment that matters — the attempt that was refused.
 *
 * The geometry is the advance payment dialog's, which is the one the app is
 * standardised on.
 */
export default function DialogRequiredNote({
  text = "A remark is required for this.",
}: {
  text?: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    paddingHorizontal: sp(20),
    // Sits tight under the remarks counter rather than a line below it.
    marginTop: -sp(4),
  },
  text: { fontSize: fs(11), color: COLORS.error, fontWeight: "600" },
});
