import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { appAlert } from "@/src/components/common/AppDialog";
import Dropdown from "@/src/components/common/DropdownProps";
import InlineOrderDateFilter, {
  type DateFilterValue,
} from "@/src/components/common/InlineOrderDateFilter";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type ApiAssignment,
} from "@/src/services/advancePayment.service";

import { formFromAssignment } from "../assignments";
import { dateWindow, localDay } from "../dateWindow";
import { COMPANIES } from "../logic/constants";
import { showFailure } from "../showError";
import { draftForAssignment } from "../draftHandover";
import { formatDateTime } from "../logic/requestLabels";
import { formatDate } from "../logic/rules";

/**
 * "Assigned to me": the SAP bills and POs somebody sent for a request to be
 * raised from them.
 *
 * ONE OF THE THREE VIEWS OF THIS PAGE, so it is a list of cards like the other
 * two — and the card is `AdvanceRequestCard`'s, part for part and style for
 * style: the same 16pt card with its number and status pill, the same party
 * column with the chips to its right, the same "Raised by" line, the same
 * two-figure invoice strip either side of a vertical rule, and the same pair of
 * full-width buttons at the foot. The two lists sit on one page behind one
 * dropdown, and a card that was nearly the same would read as a mistake.
 *
 * WHAT DIFFERS IS ONLY WHAT THE COLUMNS MEAN: the figures are the document's
 * open amount and its total rather than a request's open and requested, and the
 * buttons are Dismiss and Raise Request rather than Progress and Details.
 *
 * RAISING RE-READS SAP. The document is fetched live and the form built by the
 * shared `formFromAssignment`, so a bill paid, closed or taken by another OMS
 * request between being sent and being opened is refused HERE, with the
 * sentence that says which — not at submit, after the rest has been filled in.
 */

/** Bills or POs: the one question left, since every row here is waiting. */
const KIND_OPTIONS = [
  { label: "All", value: "" },
  { label: "Bills", value: "BILL" },
  { label: "POs", value: "PO" },
];

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AssignedList({
  rows,
  loading,
  error,
  onChanged,
}: {
  rows: ApiAssignment[];
  loading: boolean;
  error: string;
  /** Re-read: raising one takes it off the list, and so does dismissing it. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * THE SENT TAB'S FILTERS, with one difference that matters.
   *
   * Status is not a question here: everything on this list is waiting on this
   * user (the hook asks for `status=OPEN`), so the narrow dropdown narrows by
   * DOCUMENT KIND instead, which is what is left to ask.
   *
   * AND THE DATE OPENS ON ALL DATES, not this month. The Sent tab is a record
   * and the recent part of it is the interesting part; this is a to-do list,
   * and a month's window would hide work somebody is still waiting on.
   */
  const [kind, setKind] = useState<"BILL" | "PO" | "">("");
  const [company, setCompany] = useState<AdvancePaymentCompany | "">("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState<DateFilterValue>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  /**
   * What the search box looks through: who sent it, the document's number and
   * the party it belongs to — the three things somebody has in hand when
   * they come to this list.
   */
  const shown = useMemo(() => {
    const window = dateWindow(date);
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind && row.kind !== kind) return false;
      if (company && row.company !== company) return false;
      if (window) {
        const day = localDay(row.created_on);
        if (!day || day < window.from || day > window.to) return false;
      }
      if (!term) return true;
      return [
        row.assigned_by.name,
        row.assigned_by.username,
        row.sap_doc_num,
        String(row.sap_doc_entry),
        row.card_name,
        row.card_code,
        row.vendor_ref,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, kind, company, search, date]);

  /** What is in view, by kind, for the bar's second line. */
  const bills = shown.filter((row) => row.kind === "BILL").length;

  const raise = async (assignment: ApiAssignment) => {
    setBusy(assignment.id);
    try {
      draftForAssignment(assignment.id, await formFromAssignment(assignment));
      router.push({
        pathname: "/(main)/advance-payments/create",
        params: { assignment: String(assignment.id) },
      } as never);
    } catch (err) {
      // `formFromAssignment` throws a SENTENCE for the SAP cases (paid,
      // closed, held by another request) and carries no envelope, so it comes
      // through `showFailure` unchanged; a refusal from the server arrives with
      // its message and its problems, and all of them are shown.
      showFailure("Cannot raise this one", err);
    } finally {
      setBusy(null);
    }
  };

  const dismiss = (assignment: ApiAssignment) =>
    appAlert(
      "Dismiss this document?",
      `${assignment.kind === "BILL" ? "Bill" : "PO"} ${assignment.sap_doc_num} will leave your list, and whoever sent it will see that you dismissed it.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Dismiss",
          style: "destructive",
          onPress: async () => {
            try {
              await advancePaymentService.assignmentAction(assignment.id, "dismiss");
              onChanged();
            } catch (err) {
              showFailure("Could not dismiss", err);
            }
          },
        },
      ],
    );

  if (loading && rows.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            onChanged();
            setRefreshing(false);
          }}
          colors={[COLORS.primary]}
          tintColor={COLORS.primary}
        />
      }
      ListHeaderComponent={
        <>
          {/* THE SENT TAB'S HEADER, to the pixel: a narrow dropdown beside a
              wide search, both one control height, then the gradient bar with
              the count, the company Filter and the shared date control. */}
          <View style={styles.filterHead}>
            <View style={styles.filterKind}>
              <Dropdown
                label="Documents"
                data={KIND_OPTIONS}
                value={kind}
                onChange={(value: string) => setKind(value as "BILL" | "PO" | "")}
                searchable={false}
                floatingLabel
                noBottomSpacing
              />
            </View>
            <View style={styles.filterSearch}>
              <Text style={styles.filterLabel}>Search</Text>
              <View style={styles.filterSearchBox}>
                <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.filterSearchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="SENDER / NO. / PARTY"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCorrect={false}
                />
                {search ? (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.countBar}
          >
            <TouchableOpacity
              style={styles.countBarFilterBtn}
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Filter by company"
            >
              <Ionicons name="funnel-outline" size={14} color="#fff" />
              <Text style={styles.countBarFilterText}>Filter</Text>
              {company ? <View style={styles.countBarFilterDot} /> : null}
            </TouchableOpacity>

            <View style={styles.countBarTextWrap}>
              <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
                {shown.length} to raise
              </Text>
              <Text style={styles.countSubText} numberOfLines={1}>
                {bills} bill{bills === 1 ? "" : "s"} · {shown.length - bills} PO
                {shown.length - bills === 1 ? "" : "s"}
                {company ? ` · ${company}` : ""}
              </Text>
            </View>

            <View style={styles.countBarDateWrap}>
              <InlineOrderDateFilter value={date} onChange={setDate} variant="onDark" />
            </View>
          </LinearGradient>
        </>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Ionicons
            name={error ? "alert-circle-outline" : "paper-plane-outline"}
            size={44}
            color={error ? COLORS.error : COLORS.textSecondary}
          />
          <Text style={styles.emptyTitle}>
            {error ||
              (rows.length
                ? "Nothing matches those filters"
                : "Nothing assigned to you")}
          </Text>
          {!error ? (
            <Text style={styles.emptyHint}>
              {rows.length
                ? "Try widening the search, the period or the company."
                : "Bills and POs somebody sends you to raise a request from will appear here."}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const open = Number(item.open_amount) || 0;
        const total = Number(item.doc_total) || 0;
        /** Part-paid in SAP before it was ever sent: worth saying on the card. */
        const whole = open >= total - 0.005;

        return (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.docNo} numberOfLines={1}>
                {item.kind === "BILL" ? "Bill" : "PO"} {item.sap_doc_num}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: "#FFF7E6" }]}>
                <Text style={[styles.statusPillText, { color: "#B45309" }]} numberOfLines={1}>
                  To raise
                </Text>
              </View>
            </View>

            <View style={styles.partyRow}>
              <View style={styles.partyCol}>
                <Text style={styles.party} numberOfLines={2}>
                  {item.card_name || item.card_code}
                </Text>
                <Text style={styles.partyCode}>
                  {item.kind === "BILL" ? "A/P Invoice" : "Purchase Order"}
                  {item.vendor_ref ? ` · ${item.vendor_ref}` : ""}
                </Text>
              </View>
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {item.doc_date ? formatDate(item.doc_date) : "No date"}
                  </Text>
                </View>
                <View style={styles.chip}>
                  <Ionicons name="business-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {item.company}
                  </Text>
                </View>
                {item.due_date ? (
                  <View style={styles.chip}>
                    <Ionicons name="alarm-outline" size={13} color={COLORS.warning} />
                    <Text style={styles.chipText} numberOfLines={1}>
                      Due {formatDate(item.due_date)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* WHO SENT IT — the person to go back to, exactly where the
                request card names who raised it. */}
            <View style={styles.receivedFromRow}>
              <Ionicons name="person-circle-outline" size={ms(14)} color={COLORS.textSecondary} />
              <Text style={styles.receivedFromLabel}>Sent by</Text>
              <Text style={styles.receivedFromName} numberOfLines={1}>
                {item.assigned_by.name} · {formatDateTime(item.created_on)}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* The request card's invoice strip, with this document's figures:
                what is open against what the document came to. */}
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceIcon}>
                <Ionicons
                  name={item.kind === "BILL" ? "document-text" : "cart"}
                  size={ms(16)}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.invoiceCol}>
                <Text style={styles.invoiceLabel}>Open Amount</Text>
                <Text style={styles.invoiceValue} numberOfLines={1}>
                  {formatMoney(open)}
                </Text>
                <Text style={styles.invoiceNo} numberOfLines={1}>
                  As SAP held it when sent
                </Text>
              </View>

              <View style={styles.invoiceDivider} />

              <View style={[styles.invoiceIcon, styles.totalIcon]}>
                <Ionicons name="pricetag" size={ms(16)} color={COLORS.success} />
              </View>
              <View style={styles.invoiceCol}>
                <Text style={styles.invoiceLabel}>Document Total</Text>
                <Text style={styles.totalValueFigure} numberOfLines={1}>
                  {formatMoney(total)}
                </Text>
                <View
                  style={[
                    styles.invoiceChip,
                    { backgroundColor: whole ? COLORS.successLight : COLORS.warningLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.invoiceChipText,
                      { color: whole ? COLORS.success : COLORS.warning },
                    ]}
                    numberOfLines={1}
                  >
                    {whole ? "Nothing paid yet" : `${formatMoney(total - open)} already paid`}
                  </Text>
                </View>
              </View>
            </View>

            {/* The note is why this document is on YOUR list, so it sits where
                the request card puts "awaiting your decision". */}
            {item.note ? (
              <View style={styles.awaiting}>
                <Ionicons name="chatbox-ellipses-outline" size={ms(13)} color={COLORS.primary} />
                <Text style={styles.awaitingText} numberOfLines={3}>
                  {item.note}
                </Text>
              </View>
            ) : null}

            <View style={styles.divider} />

            {/* The same pair as the request card, in the same places: the
                lesser action on the left, the one that gets the work done on
                the right. */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.dismissBtn]}
                onPress={() => dismiss(item)}
                disabled={busy !== null}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss ${item.sap_doc_num}`}
              >
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.raiseBtn, busy === item.id && styles.actionBtnBusy]}
                onPress={() => raise(item)}
                disabled={busy !== null}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Raise a request for ${item.sap_doc_num}`}
              >
                {busy === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Raise Request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
      // These cards are as tall as the request cards — a header, chips, a money
      // strip and two buttons each — so the defaults mount far more than fits.
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
      ListFooterComponent={
        <Modal
          visible={filterOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Filter</Text>
                <TouchableOpacity onPress={() => setFilterOpen(false)}>
                  <Ionicons name="close" size={22} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Company</Text>
              <TouchableOpacity
                style={[styles.optionRow, !company && styles.optionRowActive]}
                onPress={() => setCompany("")}
              >
                <Text style={[styles.optionText, !company && styles.optionTextActive]}>
                  All companies
                </Text>
                {!company ? (
                  <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                ) : null}
              </TouchableOpacity>
              {COMPANIES.map((name) => {
                const active = company === name;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                    onPress={() => setCompany(name)}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {name}
                    </Text>
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalClear} onPress={() => setCompany("")}>
                  <Text style={styles.modalClearText}>Clear all</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalApply}
                  onPress={() => setFilterOpen(false)}
                >
                  <Text style={styles.modalApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      }
    />
  );
}

/** Copied from `AdvanceRequestCard.styles` — the two cards must not drift. */
const styles = StyleSheet.create({
  listContent: { paddingHorizontal: sp(14), paddingTop: sp(14), paddingBottom: sp(28) },

  // ── The Sent tab's filter header, to the pixel ───────────────────────
  filterHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: sp(10),
    marginBottom: sp(12),
  },
  filterKind: { width: "34%" },
  filterSearch: { flex: 1 },
  filterLabel: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: sp(4),
  },
  // ONE HEIGHT FOR BOTH: `Dropdown`'s floating-label field is 56pt tall.
  filterSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    height: ms(56),
    paddingHorizontal: sp(10),
    borderRadius: sp(10),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  filterSearchInput: { flex: 1, fontSize: fs(12.5), color: COLORS.text },
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    borderRadius: sp(14),
    paddingHorizontal: sp(12),
    paddingVertical: sp(10),
    marginBottom: sp(12),
  },
  // `minWidth: 0` so the count shrinks to fit rather than pushing the date
  // control off the bar.
  countBarTextWrap: { flex: 1, minWidth: 0 },
  countText: { fontSize: fs(14), fontWeight: "900", color: "#fff" },
  countSubText: { fontSize: fs(11), color: "rgba(255,255,255,0.85)", marginTop: 1 },
  countBarDateWrap: { flexShrink: 0 },
  countBarFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
  },
  countBarFilterText: { color: "#fff", fontSize: fs(12), fontWeight: "700" },
  countBarFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD166",
    marginLeft: 2,
  },

  // ── The Filter sheet, from `AdvanceListScreen` ───────────────────────
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: sp(20),
    borderTopRightRadius: sp(20),
    padding: sp(20),
    maxHeight: "75%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sp(16),
  },
  modalTitle: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },
  modalLabel: {
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: sp(8),
    textTransform: "uppercase",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sp(13),
    paddingHorizontal: sp(14),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: sp(8),
  },
  optionRowActive: { borderColor: COLORS.primary, backgroundColor: "rgba(79,70,229,0.06)" },
  optionText: { fontSize: fs(14), color: COLORS.text, fontWeight: "600" },
  optionTextActive: { color: COLORS.primary, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: sp(12), marginTop: sp(10) },
  modalClear: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sp(14),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalClearText: { fontSize: fs(14), fontWeight: "700", color: COLORS.text },
  modalApply: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sp(14),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  modalApplyText: { fontSize: fs(14), fontWeight: "700", color: "#fff" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: sp(40) },
  emptyWrap: { alignItems: "center", gap: sp(10), paddingVertical: sp(48), paddingHorizontal: sp(32) },
  emptyTitle: { fontSize: fs(15), fontWeight: "800", color: COLORS.text, textAlign: "center" },
  emptyHint: {
    fontSize: fs(12.5),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: fs(18),
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(8),
  },
  docNo: { flex: 1, fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  statusPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 20,
    flexShrink: 0,
  },
  statusPillText: { fontSize: fs(11), fontWeight: "700" },
  partyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: sp(8),
    marginTop: sp(10),
  },
  partyCol: { flexShrink: 1, minWidth: ms(150) },
  party: { fontSize: fs(14), fontWeight: "700", color: COLORS.text },
  partyCode: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: 2 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: sp(8),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(6),
  },
  chipText: { fontSize: fs(11), color: COLORS.textSecondary, fontWeight: "600" },
  receivedFromRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(5),
    marginTop: sp(6),
  },
  receivedFromLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  receivedFromName: {
    flex: 1,
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.text,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: sp(12) },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: sp(8),
    paddingVertical: sp(10),
  },
  invoiceIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(9),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  totalIcon: { backgroundColor: COLORS.successLight },
  invoiceCol: { flex: 1, minWidth: ms(110) },
  invoiceDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(2),
  },
  invoiceLabel: { fontSize: fs(11), color: COLORS.textSecondary, marginBottom: sp(2) },
  invoiceValue: { fontSize: fs(14), fontWeight: "800", color: COLORS.primary },
  totalValueFigure: { fontSize: fs(14), fontWeight: "800", color: COLORS.success },
  invoiceNo: { fontSize: fs(10), color: COLORS.textMuted, marginTop: sp(2) },
  invoiceChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(2),
    marginTop: sp(4),
  },
  invoiceChipText: { fontSize: fs(10), fontWeight: "700" },
  awaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(10),
    backgroundColor: COLORS.primaryLighter,
    borderRadius: sp(8),
    paddingHorizontal: sp(10),
    paddingVertical: sp(7),
  },
  // `flexShrink` so a long note wraps inside the band instead of widening it.
  awaitingText: { flexShrink: 1, fontSize: fs(11), fontWeight: "800", color: COLORS.primary },
  actionRow: { flexDirection: "row", gap: sp(10), marginTop: sp(14) },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: sp(10),
    paddingVertical: sp(12),
  },
  actionBtnBusy: { opacity: 0.7 },
  // The request card's pair is green then blue; here the lesser action is the
  // muted one and Raise takes the blue, so the eye lands where the work is.
  dismissBtn: { backgroundColor: COLORS.textSecondary },
  raiseBtn: { backgroundColor: COLORS.primary },
  actionBtnText: { color: "#fff", fontSize: fs(14), fontWeight: "600" },
});
