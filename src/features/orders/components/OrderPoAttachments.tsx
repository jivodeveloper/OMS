import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { appAlert } from "@/src/components/common/AppDialog";
import { COLORS, RADIUS } from "@/src/constants/theme";
import { orderService, type OrderAttachment } from "@/src/services/order.service";
import { paymentsService } from "@/src/services/payments.service";
import { openFile } from "@/src/utils/openFile";
import { fs, ms, sp } from "@/src/utils/responsive";

/**
 * The customer's purchase order, attached to a sales order.
 *
 * WHAT IT IS FOR. The customer's own PO is the paper the order is raised
 * from: it carries the rates, the quantities and the terms they actually
 * asked for. Every desk that reviews the order — billing, auditor, the rate
 * approver — is checking the order against it, and until now they had to be
 * sent it separately or take the raiser's word for what it said.
 *
 * READ ONLY HERE. Attaching and removing belongs to the order's creator while
 * the order can still be edited (the server enforces both); this component is
 * for the desks that only need to read it, which is most of them.
 *
 * A PO IS OPTIONAL. Plenty of orders are placed by phone, so an order with no
 * PO is normal and renders nothing at all — an empty "Attachments" heading on
 * most orders would be noise on every screen that carries this.
 *
 * THE FILE IS FETCHED WITH THE TOKEN, never handed to the OS as a URL: the
 * download endpoint is permission-checked, so an unauthenticated open comes
 * back 401. It is the same endpoint, and the same downloader, the payment
 * images use (`/payments/attachments/<id>/download/`).
 */
export default function OrderPoAttachments({
  orderId,
  /** A heading, where the screen around it does not already provide one. */
  title = "Customer PO",
}: {
  orderId: number;
  title?: string;
}) {
  const [files, setFiles] = useState<OrderAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    setLoading(true);
    setError("");
    orderService
      .orderAttachments(orderId)
      .then((rows) => {
        if (alive) setFiles(rows);
      })
      .catch((err: unknown) => {
        // A PO that could not be listed must not take the order screen with
        // it: the line says so and the rest of the page carries on.
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  const open = useCallback(async (file: OrderAttachment, index: number) => {
    setOpening(file.id);
    try {
      // Named for the reader, not for the store: the uploaded name is gone by
      // design, and "PO 1.pdf" is a better thing to find in a downloads
      // folder than a camera UUID.
      const name = `PO ${index + 1}.${file.file_type || "pdf"}`;
      const uri = await paymentsService.downloadAttachment(file.id, name);
      const opened = await openFile(uri, name);
      if (!opened) {
        appAlert(
          "Saved to this device",
          `${name} was downloaded, but no app on this device can open that kind of file.`,
        );
      }
    } catch (err) {
      appAlert("Could not open the PO", err instanceof Error ? err.message : String(err));
    } finally {
      setOpening(null);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.muted}>Reading the customer PO…</Text>
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

  // No PO is the ordinary case, not a gap to announce.
  if (files.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>
        {title} ({files.length})
      </Text>
      {files.map((file, index) => (
        <TouchableOpacity
          key={file.id}
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => open(file, index)}
          disabled={opening === file.id}
          accessibilityRole="button"
          accessibilityLabel={`Open customer PO ${index + 1}`}
        >
          <Ionicons
            name={file.file_type === "pdf" ? "document-text-outline" : "image-outline"}
            size={ms(16)}
            color={COLORS.primary}
          />
          <View style={styles.rowText}>
            <Text style={styles.rowName} numberOfLines={1}>
              PO {index + 1}
              {file.file_type ? ` · ${file.file_type.toUpperCase()}` : ""}
            </Text>
            {file.uploaded_by_name ? (
              <Text style={styles.rowMeta} numberOfLines={1}>
                Attached by {file.uploaded_by_name}
              </Text>
            ) : null}
          </View>
          {opening === file.id ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="open-outline" size={ms(14)} color={COLORS.primary} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(6), marginTop: sp(8) },
  centre: { flexDirection: "row", alignItems: "center", gap: sp(8), paddingVertical: sp(6) },
  muted: { fontSize: fs(11.5), color: COLORS.textSecondary },
  error: { fontSize: fs(11.5), color: COLORS.error, paddingVertical: sp(4) },

  heading: {
    fontSize: fs(10.5),
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    paddingVertical: sp(8),
    paddingHorizontal: sp(10),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  // `minWidth: 0` so a long line wraps instead of pushing the open icon off.
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: fs(12.5), fontWeight: "600", color: COLORS.primary },
  rowMeta: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 1 },
});
