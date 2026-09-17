import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS, RADIUS } from "@/src/constants/theme";
import {
  parseSapResults,
  type BackDateHanaStatus,
} from "@/src/services/backdate.service";
import { fs, sp } from "@/src/utils/responsive";

interface Props {
  /** The stored `hana_status_text`. */
  text: string | undefined;
  status: BackDateHanaStatus;
}

/**
 * What SAP said, one tinted line per company.
 *
 * SAP's own words, verbatim and never truncated: on a refusal they are the
 * only thing that says what to correct. The request parameters are recorded
 * server-side for an administrator — they are not shown here, because the
 * person reading this is deciding what to do next.
 */
export default function BackDateSapResultList({ text, status }: Props) {
  const results = parseSapResults(text, status);
  if (results.length === 0) return null;

  return (
    <View style={styles.list}>
      {results.map((result) => {
        const failed = result.status === "FAILED";
        return (
          <View
            key={`${result.branch}-${result.response.slice(0, 12)}`}
            style={[
              styles.item,
              failed ? styles.itemFailed : styles.itemOk,
            ]}
          >
            <Text
              style={[styles.text, failed ? styles.textFailed : styles.textOk]}
            >
              {result.response || "SAP returned no message."}
            </Text>
            {typeof result.sap_row_id === "number" ? (
              <Text style={styles.rowId}>SAP row id {result.sap_row_id}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: sp(8), marginTop: sp(8) },
  item: { borderRadius: RADIUS.md, paddingHorizontal: sp(12), paddingVertical: sp(10) },
  itemOk: { backgroundColor: COLORS.successLight },
  itemFailed: { backgroundColor: COLORS.errorLight },
  text: { fontSize: fs(12), lineHeight: fs(18) },
  textOk: { color: COLORS.success },
  textFailed: { color: COLORS.error },
  rowId: { fontSize: fs(11), marginTop: 4, color: COLORS.textSecondary },
});
