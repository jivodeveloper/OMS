import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type VendorOnAccount,
} from "@/src/services/advancePayment.service";

import type { OpenDocument } from "../logic/constants";
import { docEntryOf } from "../logic/requestApi";
import { formatINR } from "../logic/rules";
import { failureDetails, failureMessage } from "../showError";
import { Card } from "./AdvanceUi";

/**
 * What this vendor has ALREADY been paid that no bill has absorbed yet.
 *
 * WHY IT IS SHOWN BESIDE THE POs: a PO's open amount is what is still to be
 * received on it, and it knows nothing about money paid on account — an
 * advance journal, a down payment, a payment somebody made outside OMS. So a
 * requester can raise a second advance against a PO that has already been paid
 * for, and nothing on the page would say so.
 *
 * NOTHING IS DEDUCTED. SAP does not record which PO such a payment was for, so
 * subtracting it from a PO would be a guess presented as a figure. It is shown,
 * each line saying whether OMS posted it (and under which request) or whether
 * it was paid outside OMS, and the reader decides.
 *
 * `applies` is the server's: the ledger is only meaningful beside POs OMS
 * tracks, and when every PO in question predates that cut-off the card shows
 * nothing rather than a number nobody can act on.
 */
export default function VendorOnAccountCard({
  company,
  cardCode,
  poEntries,
}: {
  company: AdvancePaymentCompany | "";
  cardCode: string;
  /** The POs ticked — the server decides from these whether the ledger applies. */
  poEntries: OpenDocument[];
}) {
  const [data, setData] = useState<VendorOnAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // The ticked POs as a stable key, so re-rendering the form does not re-read
  // SAP on every keystroke.
  const entries = poEntries.map(docEntryOf).filter((entry) => entry > 0);
  const key = entries.join(",");

  useEffect(() => {
    if (!company || !cardCode) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    advancePaymentService
      .vendorOnAccount(
        company,
        cardCode,
        key ? key.split(",").map(Number) : [],
      )
      .then((found) => {
        if (alive) setData(found);
      })
      .catch((err) => {
        if (!alive) return;
        // A ledger this page could not read must not stop a request being
        // raised: the card says what the server said, and the form carries on.
        setError([failureMessage(err), ...failureDetails(err)].join(" "));
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [company, cardCode, key]);

  if (!company || !cardCode) return null;

  if (loading && !data) {
    return (
      <Card title="Already paid, not yet adjusted">
        <View style={styles.centre}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.muted}>Reading the vendor&apos;s ledger…</Text>
        </View>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Already paid, not yet adjusted">
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={ms(16)} color={COLORS.warning} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </Card>
    );
  }

  // Nothing outstanding, or the POs predate what OMS tracks: say nothing.
  if (!data || !data.applies || data.results.length === 0) return null;

  const total = Number(data.total_open) || 0;
  const outside = Number(data.outside_oms) || 0;

  return (
    <Card
      title="Already paid, not yet adjusted"
      subtitle="From the vendor's SAP ledger. Not deducted from any PO — SAP does not say which PO it was for."
    >
      <View style={styles.totalRow}>
        <View style={styles.totalCell}>
          <Text style={styles.totalLabel}>On account</Text>
          <Text style={styles.totalValue}>{formatINR(total)}</Text>
        </View>
        {outside > 0 ? (
          <View style={styles.totalCell}>
            <Text style={styles.totalLabel}>Paid outside OMS</Text>
            <Text style={styles.totalWarn}>{formatINR(outside)}</Text>
          </View>
        ) : null}
      </View>

      {data.results.map((row) => (
        <View key={`${row.trans_id}-${row.line_id}`} style={styles.line}>
          <View style={styles.lineHead}>
            <Text style={styles.lineNo} numberOfLines={1}>
              {row.doc_type} {row.doc_num}
            </Text>
            <Text style={styles.lineAmount}>{formatINR(Number(row.open) || 0)}</Text>
          </View>
          <Text style={styles.lineMeta} numberOfLines={2}>
            {row.posting_date ? `${row.posting_date} · ` : ""}
            {row.oms_request ? `OMS ${row.oms_request}` : "Paid outside OMS"}
            {row.reference ? ` · ${row.reference}` : ""}
          </Text>
          {row.memo ? (
            <Text style={styles.lineMemo} numberOfLines={2}>
              {row.memo}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  centre: { flexDirection: "row", alignItems: "center", gap: sp(8), paddingVertical: sp(6) },
  muted: { fontSize: fs(12), color: COLORS.textSecondary },

  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(8) },
  errorText: { flex: 1, minWidth: 0, fontSize: fs(12), color: COLORS.textSecondary },

  totalRow: { flexDirection: "row", gap: sp(12), marginBottom: sp(10) },
  totalCell: { flex: 1, minWidth: 0 },
  totalLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  totalValue: { fontSize: fs(15), fontWeight: "900", color: COLORS.text, marginTop: 2 },
  totalWarn: { fontSize: fs(15), fontWeight: "900", color: COLORS.warning, marginTop: 2 },

  line: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingVertical: sp(8) },
  lineHead: { flexDirection: "row", alignItems: "center", gap: sp(10) },
  // `minWidth: 0` so a long document type does not push the amount off the row.
  lineNo: { flex: 1, minWidth: 0, fontSize: fs(12.5), fontWeight: "700", color: COLORS.text },
  lineAmount: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  lineMeta: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 2 },
  lineMemo: { fontSize: fs(11), color: COLORS.textMuted, marginTop: 2, fontStyle: "italic" },
});
