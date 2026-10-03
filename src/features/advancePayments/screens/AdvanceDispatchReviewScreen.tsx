import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS } from "@/src/constants/theme";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentService,
  type AssignmentRecipient,
} from "@/src/services/advancePayment.service";

import { Select } from "../components/AdvanceUi";
import { failureMessage, showFailure } from "../showError";
import { DispatchSentDialog, DispatchSendingDialog } from "../components/DispatchDialogs";
import {
  markSent,
  takeSelection,
  type DispatchSelection,
} from "../dispatchHandover";
import { formatDate, formatINR } from "../logic/rules";

/**
 * Send Bills & POs, step two: what was ticked, and who it goes to.
 *
 * THE DETAIL PAGE'S SHAPE, because that is what this is — one thing being read
 * before it is acted on. The flush gradient header states what is being sent
 * and what it comes to, then the cards: the documents, who they go to, and a
 * note; the action sits at the foot in its own box, as the decision does on a
 * request. The geometry is `AdvanceDetailsScreen`'s, copied rather than
 * imported, since the data behind it is a different shape.
 *
 * WHY A SCREEN AND NOT A SHEET. Sending somebody a dozen bills to raise
 * requests from is worth reading back first: the recipient, the note and every
 * document are on one page, and nothing is hidden behind a scroll inside a
 * sheet over the list it came from.
 */
export default function AdvanceDispatchReviewScreen() {
  useBackToOrigin("/(main)/advance-payments/dispatch");

  /**
   * TAKEN ONCE, ON MOUNT. The picking screen leaves the selection in the
   * handover slot; reading it clears the slot, so this screen owns it from
   * here and a stale selection cannot be sent twice.
   */
  const [selection] = useState<DispatchSelection | null>(() => takeSelection());

  const [recipients, setRecipients] = useState<AssignmentRecipient[]>([]);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  /** Sent: the Done dialog is up, and Done leads back to a blank page. */
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  /** Room under the content for the keyboard, so the note is not covered. */
  const [keyboardSpace, setKeyboardSpace] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) =>
      setKeyboardSpace(event.endCoordinates?.height ?? 0),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardSpace(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    advancePaymentService
      .assignmentRecipients()
      .then((found) => {
        if (alive) setRecipients(found);
      })
      .catch((err) => {
        if (alive) setError(failureMessage(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Nothing to send: the selection was taken by a previous visit, or this
   * screen was opened by a deep link. Say so rather than showing an empty page
   * with a dead Send button.
   */
  if (!selection || selection.rows.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="file-tray-outline" size={44} color={COLORS.textSecondary} />
        <Text style={styles.emptyTitle}>Nothing selected</Text>
        <Text style={styles.emptyHint}>
          Pick the bills or POs to send, then press Next.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => router.replace("/(main)/advance-payments/dispatch" as never)}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyBtnText}>Back to the documents</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const noun = selection.kind === "BILL" ? "bill" : "PO";
  const total = selection.rows.reduce((sum, row) => sum + Number(row.open), 0);
  const chosenPerson = recipients.find((person) => String(person.id) === recipient);

  /**
   * CONFIRMED THE WAY A DECISION IS: a blocking progress dialog while it is in
   * flight (it is one request, and a second tap would send the documents
   * twice), then a Done dialog that states what went where. Done returns to a
   * blank picking page — `markSent` is what tells it the ticks are spent.
   */
  const send = async () => {
    if (!recipient) return;
    setSending(true);
    try {
      await advancePaymentService.sendAssignments({
        company: selection.company,
        assigned_to: Number(recipient),
        documents: selection.rows.map((row) => ({
          kind: selection.kind,
          sap_doc_entry: row.docEntry,
        })),
        note: note.trim() || undefined,
      });
      markSent();
      setDone(true);
    } catch (err) {
      showFailure("Could not send", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          keyboardSpace > 0 && { paddingBottom: keyboardSpace + sp(24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* THE REQUEST PAGE'S HEADER, to the pixel: the same gradient, the
            same title line with a white pill on the right, and the same party
            row reading left to right — here the company the documents come
            from, an arrow, and who is being asked to raise them. */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <Text style={styles.requestNo} numberOfLines={1} adjustsFontSizeToFit>
              {selection.rows.length} {selection.rows.length === 1 ? noun : `${noun}s`} ·{" "}
              {formatINR(total)}
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>To send</Text>
            </View>
          </View>

          <View style={styles.partyRow}>
            <Ionicons name="business-outline" size={ms(14)} color="#BFDBFE" />
            <Text style={styles.partyGl} numberOfLines={1}>
              {selection.company}
            </Text>
            <Ionicons name="arrow-forward" size={ms(13)} color="#BFDBFE" />
            <Text style={styles.party} numberOfLines={1}>
              {chosenPerson ? chosenPerson.name : "Choose who raises them"}
            </Text>
          </View>
        </LinearGradient>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── What is being sent ──────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons name="documents" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>
              {selection.kind === "BILL" ? "Bills" : "Purchase Orders"} ({selection.rows.length})
            </Text>
          </View>

          {selection.rows.map((row, index) => (
            <View key={row.key} style={[styles.lineRow, index > 0 && styles.lineRowBordered]}>
              <View style={styles.lineIcon}>
                <Ionicons
                  name={selection.kind === "BILL" ? "document-text-outline" : "cart-outline"}
                  size={ms(16)}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.lineText}>
                <Text style={styles.lineNo} numberOfLines={1}>
                  {selection.kind === "BILL" ? "Bill" : "PO"} {row.docNum}
                </Text>
                <Text style={styles.lineParty} numberOfLines={1}>
                  {row.cardName || row.cardCode}
                  {row.vendorRef ? ` · ${row.vendorRef}` : ""}
                </Text>
                <Text style={styles.lineMeta} numberOfLines={1}>
                  {row.date ? formatDate(row.date) : "—"}
                  {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ""}
                </Text>
              </View>
              <View style={styles.lineMoney}>
                <Text style={styles.lineAmount}>{formatINR(Number(row.open))}</Text>
                <Text style={styles.lineTotal}>of {formatINR(Number(row.total))}</Text>
              </View>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total open</Text>
            <Text style={styles.totalValue}>{formatINR(total)}</Text>
          </View>
        </View>

        {/* ── Who raises them ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons name="person-add" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>Send To</Text>
            {recipient ? (
              <Ionicons name="checkmark-circle" size={ms(16)} color={COLORS.success} />
            ) : null}
          </View>

          <Select
            label="User"
            required
            searchable
            data={recipients.map((person) => ({
              label: `${person.name} (${person.username})`,
              value: String(person.id),
            }))}
            value={recipient}
            onChange={setRecipient}
            placeholder={loading ? "Loading users…" : "Choose a user"}
          />
        </View>

        {/* ── A note, if there is anything to say ─────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons name="chatbox-ellipses" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>Remarks (optional)</Text>
          </View>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Anything the recipient should know — a deadline, which part to pay"
            placeholderTextColor={COLORS.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.noteCount}>{note.length}/500</Text>
        </View>
      </ScrollView>

      {/* THE ACTION AT THE FOOT, in its own box, as a decision is on a
          request — and dead until there is somebody to send to. */}
      <View style={styles.actionBox}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(main)/advance-payments/dispatch" as never)
          }
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to the documents"
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendBtn, (!recipient || sending) && styles.sendBtnOff]}
          onPress={send}
          disabled={!recipient || sending}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>
                Send {selection.rows.length} {selection.rows.length === 1 ? noun : `${noun}s`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* While it is in flight: no close, no backdrop dismissal. */}
      <DispatchSendingDialog visible={sending} />

      {done ? (
        <DispatchSentDialog
          count={selection.rows.length}
          noun={noun}
          total={total}
          recipient={chosenPerson?.name ?? "that user"}
          onDone={() => {
            setDone(false);
            router.replace("/(main)/advance-payments/dispatch" as never);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const WIDTH = Dimensions.get("window").width;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  content: { paddingBottom: sp(96) },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(12),
    padding: sp(32),
    backgroundColor: COLORS.background,
  },
  emptyTitle: { fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  emptyHint: { fontSize: fs(13), color: COLORS.textSecondary, textAlign: "center" },
  emptyBtn: {
    marginTop: sp(8),
    paddingHorizontal: sp(16),
    paddingVertical: sp(10),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  emptyBtnText: { fontSize: fs(13), fontWeight: "800", color: "#fff" },

  // The request page's header, copied from `AdvanceDetailsScreen`: same
  // gradient, same rounded foot, same metrics.
  header: {
    width: WIDTH,
    paddingHorizontal: sp(18),
    paddingTop: sp(16),
    paddingBottom: sp(18),
    borderBottomLeftRadius: sp(24),
    borderBottomRightRadius: sp(24),
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: sp(10) },
  requestNo: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: fs(19),
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statusPill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: sp(5),
    paddingHorizontal: sp(12),
  },
  statusText: { fontSize: fs(11), fontWeight: "800", color: COLORS.primary },
  partyRow: { flexDirection: "row", alignItems: "center", gap: sp(6), marginTop: sp(12) },
  party: { flexShrink: 1, color: "#fff", fontSize: fs(14), fontWeight: "700" },
  partyGl: { color: "#DBEAFE", fontSize: fs(12), fontWeight: "600" },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginHorizontal: sp(14),
    marginTop: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    marginBottom: sp(4),
  },
  sectionIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: sp(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  sectionTitle: { flex: 1, fontSize: fs(14), fontWeight: "800", color: COLORS.text },

  lineRow: { flexDirection: "row", alignItems: "center", gap: sp(10), paddingVertical: sp(10) },
  lineRowBordered: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  lineIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: sp(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  // `minWidth: 0` so a long vendor name ellipsises instead of pushing the
  // figures off the card.
  lineText: { flex: 1, minWidth: 0 },
  lineNo: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  lineParty: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: 2 },
  lineMeta: { fontSize: fs(11), color: COLORS.textMuted, marginTop: 2 },
  lineMoney: { alignItems: "flex-end", flexShrink: 0 },
  lineAmount: { fontSize: fs(13), fontWeight: "900", color: COLORS.primary },
  lineTotal: { fontSize: fs(10.5), color: COLORS.textMuted, marginTop: 2 },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sp(10),
    paddingTop: sp(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  totalLabel: { flex: 1, fontSize: fs(12.5), fontWeight: "700", color: COLORS.textSecondary },
  totalValue: { fontSize: fs(15), fontWeight: "900", color: COLORS.text },

  noteInput: {
    marginTop: sp(8),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(12),
    padding: sp(12),
    minHeight: ms(84),
    fontSize: fs(13),
    color: COLORS.text,
  },
  noteCount: { fontSize: fs(10.5), color: COLORS.textMuted, textAlign: "right", marginTop: sp(4) },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    backgroundColor: COLORS.errorLight,
    borderRadius: sp(12),
    padding: sp(12),
    marginHorizontal: sp(14),
    marginTop: sp(14),
  },
  errorText: { flex: 1, fontSize: fs(12), color: COLORS.error },

  actionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(14),
    paddingVertical: sp(12),
  },
  backBtn: {
    width: ms(44),
    height: ms(44),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    height: ms(44),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  sendBtnOff: { backgroundColor: COLORS.borderLight },
  sendBtnText: { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});
