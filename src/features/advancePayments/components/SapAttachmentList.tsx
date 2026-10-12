import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapAttachmentKind,
  type SapRelatedAttachment,
} from "@/src/services/advancePayment.service";

import { failureDetails, failureMessage } from "../showError";
import { formatDate } from "../logic/rules";
import type { AttachmentSource } from "./AttachmentViewerModal";

/**
 * EVERY SAP attachment related to a document — not just the latest one.
 *
 * A bill rarely carries its evidence alone: the scan is on the bill, the
 * weighbridge slip on its GRPO, the quotation on the PO behind it. The server
 * gathers all of them (`/document-attachments/`), and until now this app read
 * only the single `attachment` that comes back on the picker row — so an
 * approver saw one file, could not tell there were five, and the one they
 * opened was whichever SAP happened to call latest.
 *
 * GROUPED BY THE DOCUMENT EACH FILE SITS ON, in the server's order, so "three
 * on the GRPO, one on the PO" reads as that rather than as four loose names.
 *
 * EACH ROW OPENS ITS OWN FILE. The `line` is what names it; without one the
 * server answers the latest, which is how every row in a list ends up opening
 * the same document.
 *
 * READ WHEN SHOWN, and only then: it is a SAP round trip per document, and a
 * request may pay a dozen of them.
 */

/** One file, and what it takes to fetch exactly it. */
function AttachmentRow({
  company,
  row,
  onOpen,
}: {
  company: AdvancePaymentCompany;
  row: SapRelatedAttachment;
  onOpen: (source: AttachmentSource) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() =>
        onOpen({
          name: row.file_name,
          load: () =>
            advancePaymentService.documentAttachmentImage(
              company,
              row.kind as SapAttachmentKind,
              row.doc_entry,
              row.line,
            ),
          save: () =>
            advancePaymentService.saveDocumentAttachment(
              company,
              row.kind as SapAttachmentKind,
              row.doc_entry,
              row.file_name,
              row.line,
            ),
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open SAP attachment ${row.file_name}`}
    >
      <Ionicons name="attach-outline" size={ms(15)} color={COLORS.primary} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={2}>
          {row.file_name}
        </Text>
        {row.date || row.note ? (
          <Text style={styles.rowMeta} numberOfLines={2}>
            {row.date ? formatDate(row.date) : ""}
            {row.date && row.note ? " · " : ""}
            {row.note}
          </Text>
        ) : null}
      </View>
      <Ionicons name="open-outline" size={ms(13)} color={COLORS.primary} />
    </TouchableOpacity>
  );
}

export default function SapAttachmentList({
  company,
  kind,
  docEntry,
  onOpen,
}: {
  company: AdvancePaymentCompany;
  /** The document asked about: its own files, and those of what it came from. */
  kind: "po" | "bill";
  docEntry: number;
  onOpen: (source: AttachmentSource) => void;
}) {
  const [rows, setRows] = useState<SapRelatedAttachment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .documentAttachments(company, kind, docEntry)
      .then((found) => {
        if (alive) setRows(found);
      })
      .catch((err) => {
        // The server's own words: "SAP could not be reached" reads very
        // differently from a document that simply has nothing on it.
        if (alive) setError([failureMessage(err), ...failureDetails(err)].join(" "));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company, kind, docEntry]);

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.muted}>Reading the attachments from SAP…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <Text style={styles.error} accessibilityRole="alert">
        {error}
      </Text>
    );
  }

  if (!rows || rows.length === 0) {
    return <Text style={styles.muted}>No attachments in SAP.</Text>;
  }

  // Grouped by the document each file sits on, in the order the server sent
  // them — the bill's own first, then what it came from.
  const groups: { key: string; title: string; rows: SapRelatedAttachment[] }[] = [];
  for (const row of rows) {
    const key = `${row.kind}-${row.doc_entry}`;
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = {
        key,
        title: `${row.kind_label} ${row.doc_num ?? row.doc_entry}`,
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push(row);
  }

  return (
    <View style={styles.wrap}>
      {groups.map((group) => (
        <View key={group.key}>
          <Text style={styles.groupTitle}>
            {group.title} ({group.rows.length})
          </Text>
          {group.rows.map((row) => (
            <AttachmentRow
              key={`${row.kind}-${row.doc_entry}-${row.line}`}
              company={company}
              row={row}
              onOpen={onOpen}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(8), marginTop: sp(6) },
  centre: { flexDirection: "row", alignItems: "center", gap: sp(8), paddingVertical: sp(6) },
  muted: { fontSize: fs(11.5), color: COLORS.textSecondary, paddingVertical: sp(4) },
  error: { fontSize: fs(11.5), color: COLORS.error, paddingVertical: sp(4) },

  groupTitle: {
    fontSize: fs(10.5),
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
    marginBottom: sp(2),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    paddingVertical: sp(7),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  // `minWidth: 0` so a long file name wraps instead of pushing the open icon
  // off the row.
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: fs(12.5), fontWeight: "600", color: COLORS.primary },
  rowMeta: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 1 },
});
