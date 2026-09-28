import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { ApiRequestLog } from "@/src/services/advancePayment.service";

import { editRows } from "../logic/editChanges";

/**
 * Under an edit: what it changed, as Field / Was / Now.
 *
 * WITHOUT THIS THE HISTORY SAYS AN EDIT HAPPENED AND NOTHING ELSE. An approver
 * looking at a request amended since they last saw it could tell that somebody
 * changed something, not what — so reviewing the change meant remembering the
 * old figures. The server has written `{field: {old, new}}` on the log row all
 * along; `editRows` reads it and this draws it.
 *
 * Shared by the two screens that list these rows — the Progress page's history
 * and the Details page's "Remarks & Updates" — because one edit must not read
 * two different ways depending on which page you opened.
 *
 * The web shows the same rows as a table. React Native has none, so it is three
 * columns of `Text`, with `Was` struck through so the eye finds the new value
 * without reading the header.
 */
export default function EditChangeRows({ log }: { log: ApiRequestLog }) {
  // Only an edit has changes to show. A decision moves the request on without
  // changing what it says.
  if (log.action !== "EDITED" && log.action !== "PAYOUT_UPDATED") return null;

  const rows = editRows(log.data as Record<string, unknown> | null | undefined);
  if (rows.length === 0) return null;

  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cell, styles.field, styles.head]}>Field</Text>
        <Text style={[styles.cell, styles.head]}>Was</Text>
        <Text style={[styles.cell, styles.head]}>Now</Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={`${row.field}-${index}`}
          style={[styles.row, index > 0 && styles.rowDivider]}
        >
          <Text style={[styles.cell, styles.field]}>{row.field}</Text>
          <Text style={[styles.cell, styles.was]}>{row.was}</Text>
          <Text style={[styles.cell, styles.now]}>{row.now}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * An account typed by hand rather than read from SAP.
 *
 * The one thing on a payment-details row worth interrupting for: it is the only
 * payee detail nobody else has verified. `manual_new` separates the save that
 * introduced it from the later ones that merely carried it along.
 */
export function ManualAccountFlag({ log }: { log: ApiRequestLog }) {
  const data = log.data as Record<string, unknown> | null | undefined;
  if (log.action !== "PAYOUT_UPDATED" || !data?.manual_account) return null;

  return (
    <View style={styles.manualFlag}>
      <Ionicons name="warning" size={ms(12)} color={WARN_RED} />
      <Text style={styles.manualFlagText}>
        {data.manual_new
          ? "Bank account entered manually"
          : "Bank account is a manual entry"}{" "}
        — not from SAP
      </Text>
    </View>
  );
}

const WARN_RED = "#E25555";

const styles = StyleSheet.create({
  // Boxed and tinted so it reads as detail BELONGING to the row above it
  // rather than as another entry in the list.
  table: {
    marginTop: sp(6),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: ms(6),
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  row: {
    flexDirection: "row",
    paddingVertical: sp(5),
    paddingHorizontal: sp(7),
    gap: sp(6),
  },
  headRow: { backgroundColor: COLORS.background },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  // Equal thirds, and `flexShrink` so a long value wraps inside its own column
  // instead of pushing the other two off the screen.
  cell: { flex: 1, flexShrink: 1, fontSize: fs(11) },
  head: {
    fontSize: fs(10),
    fontWeight: "800",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  field: { fontWeight: "700", color: COLORS.text },
  was: { color: COLORS.textSecondary, textDecorationLine: "line-through" },
  now: { color: COLORS.text, fontWeight: "600" },
  manualFlag: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(4),
    marginTop: sp(5),
  },
  manualFlagText: {
    flex: 1,
    fontSize: fs(11),
    fontWeight: "700",
    color: WARN_RED,
  },
});
