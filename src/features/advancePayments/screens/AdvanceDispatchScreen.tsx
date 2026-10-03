import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
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
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentService,
  type AdvancePaymentCompany,
  type ApiAssignment,
  type SapOpenInvoice,
  type SapOpenPurchaseOrder,
} from "@/src/services/advancePayment.service";

import { ASSIGNMENT_STATUS, useAssignments } from "../assignments";
import { dateWindow, localDay } from "../dateWindow";
import { failureMessage, showFailure } from "../showError";
import { Row, Select } from "../components/AdvanceUi";
import VendorFilter, { ALL_VENDORS } from "../components/VendorFilter";
import {
  holdSelection,
  peekSelection,
  takeSent,
  type DispatchRow,
} from "../dispatchHandover";
import { COMPANIES } from "../logic/constants";
import { formatDateTime } from "../logic/requestLabels";
import { formatDate, formatINR } from "../logic/rules";

/**
 * Send Bills & POs.
 *
 * SAP's open bills and POs, sent to whoever raises the payment request from
 * them: the document lands under "Assigned to me" on their Payments page, and
 * opening it starts the form already filled from the document. The SENT side
 * follows what became of each.
 *
 * THE WEB'S PAGE, as a phone reads it. The web puts the documents in a table
 * with a tick column, a recipient select and a note above it; a phone has no
 * room for seven columns, so each document is a CARD that is tapped to tick,
 * carrying the three figures that decide whether to send it — total, open, and
 * when it is due. The four questions are the web's four — company, bills or
 * POs, from when, and whose — each a dropdown, and the paging is the same 50 a
 * page, because the endpoint is the same and SAP's answer is no smaller on a
 * phone. Who the documents go to is the NEXT screen's question.
 */

type Kind = "BILL" | "PO";
type Tab = "send" | "sent";

const PAGE_SIZE = 50;

/** The four states a sent document can be in, as the server names them. */
type AssignmentStatus = ApiAssignment["status"];



/** Bills or POs: one question, so one dropdown rather than two tabs. */
const KINDS: { label: string; value: Kind }[] = [
  { label: "Open Bills", value: "BILL" },
  { label: "Open POs", value: "PO" },
];

/**
 * One open document as both endpoints give it, by the fields these two pages
 * read. Declared with the handover, because the sending screen reads the same
 * fields back.
 */
type DocRow = DispatchRow;

const rowOf = (raw: SapOpenInvoice | SapOpenPurchaseOrder, kind: Kind): DocRow => {
  const invoice = raw as SapOpenInvoice;
  const po = raw as SapOpenPurchaseOrder;
  return {
    key: `${kind}-${raw.doc_entry}`,
    docEntry: raw.doc_entry,
    docNum: String(raw.doc_num ?? raw.doc_entry),
    cardCode: raw.card_code,
    cardName: raw.card_name,
    vendorRef: (kind === "BILL" ? invoice.party_ref : po.vendor_ref) ?? "",
    date: raw.doc_date ?? null,
    dueDate: raw.due_date ?? null,
    total: String(raw.doc_total ?? "0"),
    open: String(kind === "BILL" ? (invoice.balance_due ?? "0") : (po.open_amount ?? "0")),
  };
};

export default function AdvanceDispatchScreen() {
  // The dashboard, not the request list: this page's own key does not admit
  // anyone to the lists, so a dispatch-only user would be refused there.
  useBackToOrigin("/(main)/dashboard");

  const [tab, setTab] = useState<Tab>("send");
  /**
    * BLANK TO BEGIN WITH, both of them.
    *
    * There is no safe default company: this page lists whichever company's SAP
    * is named, and opening on OIL means somebody who meant MART reads a page of
    * the wrong documents without being told. The kind is blank for the same
    * reason the form's fields are — the answer is the user's.
    */
  const [company, setCompany] = useState<AdvancePaymentCompany | "">("");
  const [kind, setKind] = useState<Kind | "">("");
  /** One vendor, or `ALL_VENDORS` for everybody's. */
  const [vendor, setVendor] = useState({ code: ALL_VENDORS, name: "" });
  /**
   * The floor the documents are read from, as the shared control holds it: a
   * day, a month or a year. `dateWindow(...).from` is what the endpoint takes.
   */
  const [since, setSince] = useState<DateFilterValue>(null);
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /** What is ticked, by key, so paging does not lose a selection. */
  const [picked, setPicked] = useState<Record<string, DocRow>>({});

  const sent = useAssignments("sent");

  /**
   * THE SENT TAB'S OWN FILTERS.
   *
   * Filtered HERE, not on the server: `/assignments/?scope=sent` answers with
   * everything this user ever sent and takes no search, so narrowing it on the
   * device gives the same answer without a round trip per keystroke.
   *
   * The month it opens on is THIS one, because what was sent recently is what
   * is still worth chasing; a year of history is a date filter away.
   */
  /**
   * WAITING FIRST. The tab exists to answer "what is still out with somebody?"
   * — raised, dismissed and withdrawn rows are history, and they are one tap
   * away on the dropdown.
   */
  const [sentStatus, setSentStatus] = useState<AssignmentStatus | "">("OPEN");
  /** The company lives in the Filter sheet, as it does on the request list. */
  const [sentCompany, setSentCompany] = useState<AdvancePaymentCompany | "">("");
  const [sentFilterOpen, setSentFilterOpen] = useState(false);
  const [sentSearch, setSentSearch] = useState("");
  /**
   * EVERY DATE to begin with. A month's window would hide the oldest rows,
   * which are the ones somebody has been waiting on longest; the date control
   * is there for narrowing down, not for deciding what is worth seeing.
   */
  const [sentDate, setSentDate] = useState<DateFilterValue>(null);

  /**
   * ONE ANSWER AT A TIME, as the request form asks them: the company decides
   * which SAP database is read, so nothing below it means anything until it is
   * answered; the kind decides which endpoint, so the period and the vendor
   * wait on it in turn. Later controls are shown DISABLED rather than hidden,
   * so the page says what it will ask before it asks it.
   */
  const step = { company: company !== "", kind: company !== "" && kind !== "" };

  const load = useCallback(
    async (quiet = false) => {
      if (!company || !kind) {
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      setError("");
      try {
        const answer = await advancePaymentService.openForDispatch(kind, company, {
          cardCode: vendor.code || undefined,
          fromDate: dateWindow(since)?.from,
          offset: page * PAGE_SIZE,
          limit: PAGE_SIZE,
        });
        setRows(answer.rows.map((raw) => rowOf(raw, kind)));
        setTotal(answer.total);
      } catch (err) {
        setError(failureMessage(err));
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company, kind, vendor.code, since, page],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => {
    void load(true);
    void sent.reload();
    if (takeSent()) {
      // SENT MEANS SPENT: those documents are no longer open for anyone else
      // to be sent, so the page starts again rather than offering them back.
      clearAll();
      return;
    }
    /**
     * COMING BACK WITHOUT SENDING KEEPS THE SELECTION, which is the whole
     * reason the button says Proceed rather than Send. This screen unmounts
     * while the sending screen is up (`unmountOnBlur` on every drawer screen
     * but the dashboard), so the ticks are restored from the handover rather
     * than from state that no longer exists.
     */
    const held = peekSelection();
    if (held && held.company === company && held.kind === kind) {
      setPicked(Object.fromEntries(held.rows.map((row) => [row.key, row])));
    }
  });

  const chosen = useMemo(() => Object.values(picked), [picked]);

  /**
   * What the search box looks through: who it went to, the document's number
   * and the party it belongs to — the three things somebody has in hand when
   * they come back to this tab. Contains-matching and case-insensitive, like
   * every search box in the app.
   */
  const sentRows = useMemo(() => {
    const window = dateWindow(sentDate);
    const term = sentSearch.trim().toLowerCase();
    return sent.rows.filter((row) => {
      if (sentStatus && row.status !== sentStatus) return false;
      if (sentCompany && row.company !== sentCompany) return false;
      if (window) {
        const day = localDay(row.created_on);
        if (!day || day < window.from || day > window.to) return false;
      }
      if (!term) return true;
      return [
        row.assigned_to.name,
        row.assigned_to.username,
        row.sap_doc_num,
        String(row.sap_doc_entry),
        row.card_name,
        row.card_code,
        row.vendor_ref,
        row.request?.request_no ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [sent.rows, sentStatus, sentCompany, sentSearch, sentDate]);

  /**
   * The count beside each status, over everything the SEARCH and the DATE
   * leave — but not the status itself, or the option a user has selected
   * would read 0 because it is the one selected.
   */
  const sentCounts = useMemo(() => {
    const window = dateWindow(sentDate);
    const term = sentSearch.trim().toLowerCase();
    const inScope = sent.rows.filter((row) => {
      if (sentCompany && row.company !== sentCompany) return false;
      if (window) {
        const day = localDay(row.created_on);
        if (!day || day < window.from || day > window.to) return false;
      }
      if (!term) return true;
      return [row.assigned_to.name, row.sap_doc_num, row.card_name, row.card_code]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    const of = (status: AssignmentStatus) =>
      inScope.filter((row) => row.status === status).length;
    return {
      all: inScope.length,
      OPEN: of("OPEN"),
      RAISED: of("RAISED"),
      DISMISSED: of("DISMISSED"),
      WITHDRAWN: of("WITHDRAWN"),
    };
  }, [sent.rows, sentCompany, sentSearch, sentDate]);

  /** Still waiting on somebody, over everything sent: the tab's badge. */
  const waiting = useMemo(
    () => sent.rows.filter((row) => row.status === "OPEN").length,
    [sent.rows],
  );

  /**
   * ONE WORD EACH, no counts: a dropdown is for choosing, and the bar under it
   * already says how many the choice left. Counting inside the options also
   * made them jump about as the search was typed into.
   */
  const sentStatusOptions = [
    { label: "All", value: "" },
    ...(["OPEN", "RAISED", "DISMISSED", "WITHDRAWN"] as AssignmentStatus[]).map((status) => ({
      label: ASSIGNMENT_STATUS[status].label,
      value: status,
    })),
  ];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (row: DocRow) =>
    setPicked((current) => {
      const next = { ...current };
      if (next[row.key]) delete next[row.key];
      else next[row.key] = row;
      return next;
    });

  /** Changing what is being looked at starts the paging again. */
  const reset = (change: () => void) => {
    change();
    setPage(0);
  };

  /**
   * A VENDOR BELONGS TO ONE COMPANY'S SAP, so changing the company drops the
   * chosen vendor rather than filtering the new company by a code that means
   * nothing in it. The ticks go too: they are that company's documents.
   */
  useEffect(() => {
    setVendor({ code: ALL_VENDORS, name: "" });
    setPicked({});
  }, [company]);

  /** Back to the blank page the screen opens on. */
  const clearAll = () => {
    setPicked({});
    setVendor({ code: ALL_VENDORS, name: "" });
    setSince(null);
    setKind("");
    setCompany("");
    setPage(0);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(
          [
            { value: "send" as const, label: "Send", icon: "paper-plane-outline" as const },
            { value: "sent" as const, label: "Sent", icon: "time-outline" as const },
          ] satisfies { value: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[]
        ).map((option) => {
          const active = tab === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(option.value)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={option.icon}
                size={15}
                color={active ? COLORS.primary : COLORS.textSecondary}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{option.label}</Text>
              {option.value === "sent" && waiting > 0 ? (
                <View style={styles.tabCount}>
                  <Text style={styles.tabCountText}>{waiting}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
              void sent.reload();
            }}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {tab === "send" ? (
          <>
            {/* WHAT TO LOOK AT. The company decides which SAP database is
                read, so it comes first and clears the page with it; the kind
                and the date are one short question each and share the row
                under it; the vendor takes its own, because a name does not fit
                half a row. */}
            <View style={styles.card}>
              <Select
                label="Company"
                required
                data={COMPANIES.map((name) => ({ label: name, value: name }))}
                value={company}
                onChange={(value) => reset(() => setCompany(value as AdvancePaymentCompany))}
                placeholder="Select company"
              />

              <Row>
                <Select
                  label="Documents"
                  required
                  data={KINDS}
                  value={kind}
                  onChange={(value) => reset(() => setKind(value as Kind))}
                  placeholder={step.company ? "Bills or POs" : "Company first"}
                  disabled={!step.company}
                />
                {/* POSTED ON OR AFTER, and the app's own date control, so a
                    specific day or a specific month can be chosen as well as a
                    year. SAP's answer is a floor rather than a window, because
                    the endpoint takes `from_date`: a month means "from the 1st
                    of it", which is what the label says. */}
                <View style={styles.sinceField}>
                  <Text style={styles.sinceLabel}>Posted From</Text>
                  {step.kind ? (
                    <InlineOrderDateFilter
                      value={since}
                      onChange={(value) => reset(() => setSince(value))}
                      variant="field"
                    />
                  ) : (
                    <View style={styles.sinceDisabled}>
                      <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                      <Text style={styles.sinceDisabledText}>Documents first</Text>
                    </View>
                  )}
                </View>
              </Row>

              {/* ALL, OR ONE. "All vendors" lists everything the period allows;
                  choosing a name narrows every figure on the page to them. */}
              {step.kind ? (
                <VendorFilter
                  company={company as AdvancePaymentCompany}
                  value={vendor.code}
                  valueName={vendor.name}
                  onPick={(picked) => reset(() => setVendor(picked))}
                />
              ) : (
                <Select
                  label="Vendor"
                  data={[]}
                  value=""
                  onChange={() => {}}
                  placeholder="Documents first"
                  disabled
                />
              )}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {!step.kind ? (
              <View style={styles.centered}>
                <Ionicons name="options-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>
                  {step.company
                    ? "Choose bills or POs to list them."
                    : "Choose a company to begin."}
                </Text>
              </View>
            ) : loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : rows.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="file-tray-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>
                  No open {kind === "BILL" ? "bills" : "POs"}
                  {vendor.code ? ` for ${vendor.name || vendor.code}` : ""}
                  {since ? " posted in that period" : ""}.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.countLine}>
                  {total} open {kind === "BILL" ? "bills" : "POs"}
                  {vendor.code ? ` · ${vendor.name || vendor.code}` : " · all vendors"} · page{" "}
                  {page + 1} of {pages}
                </Text>

                {rows.map((row) => {
                  const ticked = Boolean(picked[row.key]);
                  return (
                    <TouchableOpacity
                      key={row.key}
                      style={[styles.doc, ticked && styles.docPicked]}
                      onPress={() => toggle(row)}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: ticked }}
                    >
                      <Ionicons
                        name={ticked ? "checkbox" : "square-outline"}
                        size={20}
                        color={ticked ? COLORS.primary : COLORS.textMuted}
                      />
                      <View style={styles.docBody}>
                        <Text style={styles.docNo} numberOfLines={1}>
                          {kind === "BILL" ? "Bill" : "PO"} {row.docNum}
                        </Text>
                        <Text style={styles.docParty} numberOfLines={1}>
                          {row.cardName || row.cardCode}
                          {row.vendorRef ? ` · ${row.vendorRef}` : ""}
                        </Text>
                        <Text style={styles.docMeta} numberOfLines={1}>
                          {row.date ? formatDate(row.date) : "—"}
                          {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ""}
                        </Text>
                      </View>
                      <View style={styles.docMoney}>
                        <Text style={styles.docOpen}>{formatINR(Number(row.open))}</Text>
                        <Text style={styles.docTotal}>of {formatINR(Number(row.total))}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {pages > 1 ? (
                  <View style={styles.pager}>
                    <TouchableOpacity
                      style={[styles.pageBtn, page === 0 && styles.pageBtnOff]}
                      disabled={page === 0}
                      onPress={() => setPage((current) => Math.max(0, current - 1))}
                    >
                      <Ionicons name="chevron-back" size={16} color={COLORS.primary} />
                      <Text style={styles.pageBtnText}>Previous</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pageBtn, page + 1 >= pages && styles.pageBtnOff]}
                      disabled={page + 1 >= pages}
                      onPress={() => setPage((current) => current + 1)}
                    >
                      <Text style={styles.pageBtnText}>Next</Text>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            {/* THE TRACKING PAGES' HEADER, to the pixel: the status dropdown
                and the search box on one row, then the gradient bar with the
                count and the shared date control. */}
            <View style={styles.trackHead}>
              <View style={styles.trackStatus}>
                <Dropdown
                  label="Status"
                  data={sentStatusOptions}
                  value={sentStatus}
                  onChange={(value: string) => setSentStatus(value as AssignmentStatus | "")}
                  searchable={false}
                  floatingLabel
                  noBottomSpacing
                />
              </View>
              <View style={styles.trackSearch}>
                <Text style={styles.trackLabel}>Search</Text>
                <View style={styles.trackSearchBox}>
                  <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.trackSearchInput}
                    value={sentSearch}
                    onChangeText={setSentSearch}
                    placeholder="USER / NO. / PARTY"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCorrect={false}
                  />
                  {sentSearch ? (
                    <TouchableOpacity
                      onPress={() => setSentSearch("")}
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
                onPress={() => setSentFilterOpen(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Filter by company"
              >
                <Ionicons name="funnel-outline" size={14} color="#fff" />
                <Text style={styles.countBarFilterText}>Filter</Text>
                {sentCompany ? <View style={styles.countBarFilterDot} /> : null}
              </TouchableOpacity>

              <View style={styles.countBarTextWrap}>
                <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
                  {sentRows.length} sent
                </Text>
                <Text style={styles.countSubText} numberOfLines={1}>
                  {sentCounts.OPEN} still waiting
                  {sentCompany ? ` · ${sentCompany}` : ""}
                </Text>
              </View>
              <View style={styles.countBarDateWrap}>
                <InlineOrderDateFilter
                  value={sentDate}
                  onChange={setSentDate}
                  variant="onDark"
                />
              </View>
            </LinearGradient>

            {sent.error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{sent.error}</Text>
              </View>
            ) : null}

            {sent.loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : sentRows.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="paper-plane-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>
                  {sent.rows.length
                    ? "Nothing sent matches those filters."
                    : "Nothing sent yet."}
                </Text>
              </View>
            ) : (
              sentRows.map((row) => {
                const status = ASSIGNMENT_STATUS[row.status];
                const tone =
                  status.tone === "ok"
                    ? { fg: COLORS.success, bg: COLORS.successLight }
                    : status.tone === "hold"
                      ? { fg: COLORS.warning, bg: COLORS.warningLight }
                      : { fg: COLORS.textSecondary, bg: COLORS.borderLight };
                return (
                  <View key={row.id} style={styles.sentCard}>
                    {/* The number, and where it stands — the request card's
                        own header line. */}
                    <View style={styles.sentHead}>
                      <Text style={styles.sentNo} numberOfLines={1}>
                        {row.kind === "BILL" ? "Bill" : "PO"} {row.sap_doc_num}
                      </Text>
                      <View style={[styles.sentPill, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.sentPillText, { color: tone.fg }]}>
                          {status.label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.chipRow}>
                      <View style={styles.chip}>
                        <Ionicons name="business-outline" size={13} color={COLORS.primary} />
                        <Text style={styles.chipText} numberOfLines={1}>
                          {row.company}
                        </Text>
                      </View>
                      <View style={styles.chip}>
                        <Ionicons name="person-outline" size={13} color={COLORS.primary} />
                        <Text style={styles.chipText} numberOfLines={1}>
                          {row.assigned_to.name}
                        </Text>
                      </View>
                      <View style={styles.chip}>
                        <Ionicons name="time-outline" size={13} color={COLORS.textSecondary} />
                        <Text style={[styles.chipText, { color: COLORS.textSecondary }]} numberOfLines={1}>
                          {formatDateTime(row.created_on)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.sentPartyRow}>
                      <Ionicons
                        name="storefront-outline"
                        size={ms(15)}
                        color={COLORS.textSecondary}
                      />
                      <Text style={styles.sentParty} numberOfLines={1}>
                        {row.card_name || row.card_code}
                        {row.vendor_ref ? ` · ${row.vendor_ref}` : ""}
                      </Text>
                    </View>

                    {/* THE TWO FIGURES, split by a rule, as the request cards
                        split what is open from what is being paid. */}
                    <View style={styles.moneyStrip}>
                      <View style={styles.moneyCell}>
                        <Text style={styles.moneyLabel}>Open when sent</Text>
                        <Text style={styles.moneyValue}>
                          {formatINR(Number(row.open_amount))}
                        </Text>
                      </View>
                      <View style={styles.moneyRule} />
                      <View style={styles.moneyCell}>
                        <Text style={styles.moneyLabel}>Document total</Text>
                        <Text style={styles.moneyValueMuted}>
                          {formatINR(Number(row.doc_total))}
                        </Text>
                      </View>
                    </View>

                    {row.note ? (
                      <Text style={styles.sentNote} numberOfLines={3}>
                        “{row.note}”
                      </Text>
                    ) : null}

                    {/* WHERE IT STANDS, AND WHAT CAN BE DONE. The left button
                        is the state: once a request has been raised it OPENS
                        that request, which is the only question anyone asks of
                        a raised row. Withdraw is live only while it waits
                        — there is nothing to take back afterwards. */}
                    <View style={styles.sentActions}>
                      <TouchableOpacity
                        style={[styles.statusBtn, { borderColor: tone.fg, backgroundColor: tone.bg }]}
                        onPress={() => {
                          if (!row.request) return;
                          router.push({
                            pathname: "/(main)/advance-payments/details",
                            params: { id: String(row.request.id) },
                          } as never);
                        }}
                        disabled={!row.request}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={
                          row.request
                            ? `Open ${row.request.request_no}`
                            : `Status: ${status.label}`
                        }
                      >
                        <Ionicons
                          name={
                            row.status === "RAISED"
                              ? "open-outline"
                              : row.status === "OPEN"
                                ? "hourglass-outline"
                                : "remove-circle-outline"
                          }
                          size={15}
                          color={tone.fg}
                        />
                        <Text style={[styles.statusBtnText, { color: tone.fg }]} numberOfLines={1}>
                          {row.request ? row.request.request_no : status.label}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.withdrawBtn,
                          row.status !== "OPEN" && styles.withdrawBtnOff,
                        ]}
                        onPress={() =>
                          appAlert(
                            "Withdraw this document?",
                            `${row.kind === "BILL" ? "Bill" : "PO"} ${row.sap_doc_num} will be taken off ${row.assigned_to.name}'s list.`,
                            [
                              { text: "Keep it", style: "cancel" },
                              {
                                text: "Withdraw",
                                style: "destructive",
                                onPress: async () => {
                                  try {
                                    await advancePaymentService.assignmentAction(
                                      row.id,
                                      "withdraw",
                                    );
                                    await sent.reload();
                                  } catch (err) {
                                    showFailure("Could not withdraw", err);
                                  }
                                },
                              },
                            ],
                          )
                        }
                        disabled={row.status !== "OPEN"}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name="arrow-undo-outline"
                          size={15}
                          color={row.status === "OPEN" ? COLORS.error : COLORS.textMuted}
                        />
                        <Text
                          style={[
                            styles.withdrawBtnText,
                            row.status !== "OPEN" && styles.withdrawBtnTextOff,
                          ]}
                        >
                          Withdraw
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* The Sent tab's company filter, in the request list's own sheet. */}
      <Modal
        visible={sentFilterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSentFilterOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setSentFilterOpen(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Company</Text>
            <TouchableOpacity
              style={[styles.optionRow, !sentCompany && styles.optionRowActive]}
              onPress={() => setSentCompany("")}
            >
              <Text style={[styles.optionText, !sentCompany && styles.optionTextActive]}>
                All companies
              </Text>
              {!sentCompany ? (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              ) : null}
            </TouchableOpacity>
            {COMPANIES.map((name) => {
              const active = sentCompany === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => setSentCompany(name)}
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
              <TouchableOpacity style={styles.modalClear} onPress={() => setSentCompany("")}>
                <Text style={styles.modalClearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApply}
                onPress={() => setSentFilterOpen(false)}
              >
                <Text style={styles.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WHAT IS TICKED, AND WHAT HAPPENS NEXT. The count has to stay
          visible while a long list is scrolled, and the two things to do with a
          selection are to drop it or to go on and send it — so the cross is
          small and on the left, and Next takes the rest of the row. Who it goes
          to is the NEXT screen's question, not a third control here. */}
      {tab === "send" && chosen.length > 0 ? (
        <View style={styles.sendBox}>
          {/* CLEAR MEANS START AGAIN: the ticks and every answer above them,
              back to the blank page the screen opens on. Half-clearing it —
              dropping the ticks but keeping a company and a vendor — is the
              state nobody asks for. */}
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={clearAll}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Clear the selection and the filters"
          >
            <Ionicons name="close" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => {
              // Both are answered: nothing can be ticked before they are.
              if (!company || !kind) return;
              holdSelection({ company, kind, rows: chosen });
              router.push("/(main)/advance-payments/dispatch-review" as never);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <View style={styles.nextText}>
              <Text style={styles.nextTitle}>Proceed</Text>
              <Text style={styles.nextSub} numberOfLines={1}>
                {chosen.length} {chosen.length === 1 ? "document" : "documents"} ·{" "}
                {formatINR(chosen.reduce((sum, row) => sum + Number(row.open), 0))}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  tabs: {
    flexDirection: "row",
    gap: sp(8),
    paddingHorizontal: sp(14),
    paddingTop: sp(12),
    paddingBottom: sp(4),
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    paddingVertical: sp(9),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  tabActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLighter },
  tabText: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary },
  tabCount: {
    minWidth: ms(18),
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  tabCountText: { fontSize: fs(10), fontWeight: "900", color: "#fff" },

  body: { flex: 1 },
  content: { padding: sp(14), paddingBottom: sp(28) },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: sp(14),
    marginBottom: sp(12),
    gap: sp(10),
  },

  countLine: { fontSize: fs(11.5), color: COLORS.textMuted, marginBottom: sp(8) },

  // ── The Sent tab's tracking header, from `AdvanceListScreen` ─────────
  // "Posted From" is the shared date control, so it carries the label the
  // Selects draw for themselves.
  sinceField: { flex: 1, marginTop: 16 },
  sinceLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  // The same 56pt box the control itself draws (and the dropdown beside it),
  // so the row keeps its height before the kind has been chosen.
  sinceDisabled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 56,
    width: "100%",
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBackground,
  },
  sinceDisabledText: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.textMuted },

  // The status answers one of five words; the search takes the rest of the row.
  trackHead: { flexDirection: "row", alignItems: "flex-end", gap: sp(10), marginBottom: sp(12) },
  trackStatus: { width: "34%" },
  trackSearch: { flex: 1 },
  trackLabel: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: sp(4),
  },
  // ONE HEIGHT FOR BOTH. `Dropdown`'s floating-label field is 56pt tall, and
  // a search box beside it at 48 read as a mistake.
  trackSearchBox: {
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
  trackSearchInput: { flex: 1, fontSize: fs(12.5), color: COLORS.text },
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

  // ── A sent document, as a card ───────────────────────────────────────
  sentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: sp(14),
    marginBottom: sp(12),
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sentHead: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  // `minWidth: 0` so a long number ellipsises rather than pushing the pill off.
  sentNo: { flex: 1, minWidth: 0, fontSize: fs(15), fontWeight: "900", color: COLORS.text },
  sentPill: { paddingHorizontal: sp(10), paddingVertical: sp(4), borderRadius: 999 },
  sentPillText: { fontSize: fs(10.5), fontWeight: "800" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: sp(6), marginTop: sp(10) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(4),
  },
  chipText: { flexShrink: 1, fontSize: fs(11), fontWeight: "700", color: COLORS.primary },
  sentPartyRow: { flexDirection: "row", alignItems: "center", gap: sp(6), marginTop: sp(10) },
  sentParty: { flex: 1, fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  moneyStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sp(12),
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  moneyCell: { flex: 1 },
  moneyRule: {
    width: 1,
    height: ms(28),
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(10),
  },
  moneyLabel: { fontSize: fs(10.5), color: COLORS.textMuted },
  moneyValue: { fontSize: fs(14.5), fontWeight: "900", color: COLORS.primary, marginTop: 2 },
  moneyValueMuted: {
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sentNote: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginTop: sp(8),
    lineHeight: fs(17),
  },
  sentActions: { flexDirection: "row", alignItems: "center", gap: sp(8), marginTop: sp(12) },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    height: ms(40),
    borderRadius: sp(12),
    borderWidth: 1,
  },
  statusBtnText: { flexShrink: 1, fontSize: fs(12.5), fontWeight: "800" },
  withdrawBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    height: ms(40),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorLight,
  },
  withdrawBtnOff: { borderColor: COLORS.borderLight, backgroundColor: COLORS.background },
  withdrawBtnText: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.error },
  withdrawBtnTextOff: { color: COLORS.textMuted },

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
  doc: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    backgroundColor: COLORS.surface,
    borderRadius: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: sp(12),
    marginBottom: sp(10),
  },
  docPicked: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLighter },
  // `minWidth: 0` so a long vendor name ellipsises instead of pushing the
  // figures off the card.
  docBody: { flex: 1, minWidth: 0 },
  docNo: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  docParty: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: 2 },
  docMeta: { fontSize: fs(11), color: COLORS.textMuted, marginTop: 2 },
  docMoney: { alignItems: "flex-end", flexShrink: 0 },
  docOpen: { fontSize: fs(13), fontWeight: "900", color: COLORS.primary },
  docTotal: { fontSize: fs(10.5), color: COLORS.textMuted, marginTop: 2 },

  pager: { flexDirection: "row", justifyContent: "space-between", marginTop: sp(4) },
  pageBtn: { flexDirection: "row", alignItems: "center", gap: sp(4), padding: sp(8) },
  pageBtnOff: { opacity: 0.4 },
  pageBtnText: { fontSize: fs(12), fontWeight: "800", color: COLORS.primary },

  centered: { alignItems: "center", justifyContent: "center", gap: sp(10), paddingVertical: sp(40) },
  emptyText: { fontSize: fs(13), color: COLORS.textSecondary, textAlign: "center" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    backgroundColor: COLORS.errorLight,
    borderRadius: sp(12),
    padding: sp(12),
    marginBottom: sp(12),
  },
  errorText: { flex: 1, fontSize: fs(12), color: COLORS.error },

  // The selection's own bar: a small cross to drop it, and Next taking the
  // rest of the row because going on is what is usually wanted.
  sendBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(14),
    paddingVertical: sp(12),
  },
  clearBtn: {
    width: ms(44),
    height: ms(44),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    minHeight: ms(44),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
    paddingHorizontal: sp(14),
    paddingVertical: sp(8),
  },
  nextText: { flex: 1, minWidth: 0 },
  nextTitle: { fontSize: fs(15), fontWeight: "800", color: "#fff" },
  nextSub: { fontSize: fs(12), color: "rgba(255,255,255,0.9)", marginTop: 2 },
});
