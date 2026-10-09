import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  type AttachmentCheck,
  type AttachmentReading,
  type ReadField,
} from "@/src/services/advancePayment.service";

/**
 * What reading a PO's or bill's SAP attachment found, and how it compares with
 * what SAP itself holds.
 *
 * WHAT THIS IS FOR. The attachment is the supplier's own paper. An approver
 * agreeing a payment against a bill wants to know that the bill SAP has and the
 * bill in the scan are the same bill — a different invoice number, a different
 * amount or a different bank account is the one thing worth stopping for, and
 * it is invisible unless somebody opens the file and compares by eye.
 *
 * `stored` is the reading SAVED WITH THE REQUEST when it was raised, and is
 * shown as it is. Without one — a request raised before readings were saved, or
 * one whose document was still being read at Submit — the file is read now,
 * which is slower but says the same thing.
 */

const LABEL: Record<string, string> = {
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  amount: "Amount",
  party_name: "Party",
  account_number: "Account number",
  ifsc: "IFSC",
};

const show = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};

/** One line per field: what the scan said, and whether SAP agrees. */
function ReadingFields({ data }: { data: AttachmentReading }) {
  const entries = Object.entries(data.fields) as [string, ReadField<string | number>][];
  const read = entries.filter(([, field]) => field.value !== null && field.value !== "");

  if (read.length === 0) {
    return (
      <Text style={styles.muted}>
        Nothing could be read from {data.file_name || "the attachment"}.
      </Text>
    );
  }

  return (
    <View style={styles.table}>
      {read.map(([key, field], index) => {
        // `match` is three-valued on purpose: false is a real disagreement,
        // null only means there was nothing on SAP's side to compare against.
        // Rendering null as "differs" would cry wolf on every field SAP does
        // not carry.
        const differs = field.match === false;
        const agrees = field.match === true;
        return (
          <View key={key} style={[styles.row, index > 0 && styles.rowDivider]}>
            <Text style={styles.field}>{LABEL[key] ?? key.replace(/_/g, " ")}</Text>
            <View style={styles.values}>
              <Text style={[styles.value, differs && styles.valueBad]}>{show(field.value)}</Text>
              {differs ? (
                <Text style={styles.sap}>SAP: {show(field.sap)}</Text>
              ) : null}
            </View>
            <Ionicons
              name={differs ? "alert-circle" : agrees ? "checkmark-circle" : "remove-circle-outline"}
              size={ms(14)}
              color={differs ? BAD : agrees ? OK : COLORS.textMuted}
            />
          </View>
        );
      })}
      <Text style={styles.source}>
        Read from {data.file_name}
        {data.pages ? ` · ${data.pages} ${data.pages === 1 ? "page" : "pages"}` : ""}
        {data.source ? ` · ${data.source}` : ""}
      </Text>
    </View>
  );
}

export default function AttachmentReadingRows({
  stored,
}: {
  /**
   * The reading SAVED WITH THE REQUEST. There is no other kind now: the
   * automatic OCR of SAP attachments was removed on 2026-10-07, on both
   * clients, so a request raised since carries none and this shows nothing.
   * Reading one here would be ~10 s a page for a comparison nobody acted on.
   */
  stored?: AttachmentCheck | null;
}) {
  const reading = stored;

  if (!reading) return null;
  if ("error" in reading) {
    return (
      <Text style={styles.error} accessibilityRole="alert">
        Could not read the attachment: {reading.error}
      </Text>
    );
  }
  return <ReadingFields data={reading} />;
}

const OK = "#2E9E5B";
const BAD = "#E25555";

const styles = StyleSheet.create({
  table: {
    marginTop: sp(4),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: ms(6),
    overflow: "hidden",
    backgroundColor: COLORS.background,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(6),
    paddingVertical: sp(5),
    paddingHorizontal: sp(7),
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  field: { width: "34%", fontSize: fs(11), color: COLORS.textSecondary },
  values: { flex: 1, minWidth: 0 },
  value: { fontSize: fs(11.5), fontWeight: "600", color: COLORS.text },
  valueBad: { color: BAD },
  sap: { fontSize: fs(10.5), color: COLORS.textSecondary, marginTop: 1 },
  source: {
    fontSize: fs(10),
    color: COLORS.textMuted,
    paddingHorizontal: sp(7),
    paddingBottom: sp(5),
  },
  muted: { fontSize: fs(11.5), color: COLORS.textSecondary, marginTop: sp(4) },
  error: { fontSize: fs(11.5), color: BAD, marginTop: sp(4) },
});
