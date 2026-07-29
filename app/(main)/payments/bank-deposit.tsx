import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Button, Surface, TextInput } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import FormField from "./_components/FormField";
import DepositPaymentRow from "./_components/DepositPaymentRow";
import UploadCard from "./_components/UploadCard";
import { COMPANY_OPTIONS, formatAmount } from "./_lib/constants";
import {
  AVAILABLE_BALANCE,
  BANK_ACCOUNT_OPTIONS,
  DEPOSIT_DATE_RANGE,
  DEPOSIT_TYPE_OPTIONS,
  DEPOSITABLE_PAYMENTS,
  DEPOSITED_BY_OPTIONS,
  PARTY_FILTERS,
} from "./_lib/depositData";

// Android needs this opt-in for LayoutAnimation to run at all.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function BankDepositScreen() {
  const [company, setCompany] = useState<string | null>(null);
  const [depositDate, setDepositDate] = useState("2026-07-28");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [depositedBy, setDepositedBy] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState<string | null>(null);
  const [depositType, setDepositType] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");

  const [listExpanded, setListExpanded] = useState(true);
  const [search, setSearch] = useState("");
  // Empty = no date filter applied; set by the picker below.
  const [dateFilter, setDateFilter] = useState("");
  const [showFilterDatePicker, setShowFilterDatePicker] = useState(false);
  const [partyFilter, setPartyFilter] = useState<string | null>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [depositSlip, setDepositSlip] = useState<string | null>(null);
  const [depositReceipt, setDepositReceipt] = useState<string | null>(null);

  const animate = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
  }, []);

  // Filtering is pure display work over the dummy list — no query, no API.
  const visiblePayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return DEPOSITABLE_PAYMENTS.filter((payment) => {
      if (partyFilter && partyFilter !== "all" && payment.party !== partyFilter) {
        return false;
      }
      if (!term) return true;
      return (
        payment.party.toLowerCase().includes(term) ||
        payment.invoice.toLowerCase().includes(term)
      );
    });
  }, [search, partyFilter]);

  const selectedPayments = DEPOSITABLE_PAYMENTS.filter((payment) =>
    selectedIds.includes(payment.id),
  );

  const totalSelected = selectedPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const totalCash = selectedPayments
    .filter((payment) => payment.method === "Cash")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalCheque = selectedPayments
    .filter((payment) => payment.method === "Cheque")
    .reduce((sum, payment) => sum + payment.amount, 0);

  const togglePayment = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Balance banner, flush under the navbar ──────────────────── */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          {/* Row 1: selection badge left, amount right. */}
          <View style={styles.bannerTopRow}>
            <View style={styles.bannerPill}>
              <Ionicons name="business-outline" size={14} color={COLORS.primary} />
              <Text style={styles.bannerPillText}>
                {selectedIds.length} Selected
              </Text>
            </View>
            <Text style={styles.bannerAmount} numberOfLines={1}>
              ₹{formatAmount(totalSelected)}
            </Text>
          </View>

          {/* Row 2: balance chips left, label right — mirrors row 1's axis. */}
          <View style={styles.bannerSecondRow}>
            <View style={styles.balanceRow}>
              <View style={styles.balanceChip}>
                <Ionicons name="cash-outline" size={13} color="#fff" />
                <Text style={styles.balanceChipText}>
                  Cash ₹{formatAmount(AVAILABLE_BALANCE.cash)}
                </Text>
              </View>
              <View style={styles.balanceChip}>
                <Ionicons name="document-text-outline" size={13} color="#fff" />
                <Text style={styles.balanceChipText}>
                  Cheque ₹{formatAmount(AVAILABLE_BALANCE.cheque)}
                </Text>
              </View>
            </View>
            <Text style={styles.bannerLabel}>TOTAL DEPOSIT</Text>
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Bank Deposit</Text>
            <Text style={styles.introSubtitle}>
              Deposit collected payments into a company bank account.
            </Text>
          </View>

          {/* ── 1. Deposit information ────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>DEPOSIT INFORMATION</Text>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Company"
                data={COMPANY_OPTIONS}
                value={company}
                onChange={setCompany}
                placeholder="Select company..."
                searchable={false}
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            {/* Deposit Date — web uses a native date input, native uses the
                picker (same split as the Create Order delivery date). */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Deposit Date<Text style={styles.required}> *</Text>
              </Text>
              {Platform.OS === "web" ? (
                <View style={styles.webDateWrapper}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                  {/* @ts-ignore — 'input' is valid on web */}
                  <input
                    type="date"
                    value={depositDate}
                    onChange={(event: any) => setDepositDate(event.target.value)}
                    style={{
                      border: "none",
                      outline: "none",
                      fontSize: 14,
                      color: COLORS.black,
                      background: "transparent",
                      width: "100%",
                      marginLeft: 10,
                      cursor: "pointer",
                    }}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <TextInput
                      value={depositDate}
                      mode="outlined"
                      placeholder="Select date"
                      editable={false}
                      pointerEvents="none"
                      textColor={COLORS.black}
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                      left={
                        <TextInput.Icon
                          icon="calendar-outline"
                          color={COLORS.primary}
                        />
                      }
                    />
                  </TouchableOpacity>

                  {showDatePicker ? (
                    <DateTimePicker
                      value={depositDate ? new Date(depositDate) : new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_event, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) {
                          setDepositDate(selectedDate.toISOString().split("T")[0]);
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Deposited By"
                data={DEPOSITED_BY_OPTIONS}
                value={depositedBy}
                onChange={setDepositedBy}
                placeholder="Select person..."
                leftIcon="person-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Bank Account"
                data={BANK_ACCOUNT_OPTIONS}
                value={bankAccount}
                onChange={setBankAccount}
                placeholder="Select bank account..."
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Deposit Type"
                data={DEPOSIT_TYPE_OPTIONS}
                value={depositType}
                onChange={setDepositType}
                placeholder="Select deposit type..."
                searchable={false}
                leftIcon="swap-vertical-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>
          </Surface>

          {/* ── 2. Payments included ──────────────────────────────────── */}
          <Surface style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              activeOpacity={0.8}
              onPress={() => {
                animate();
                setListExpanded((prev) => !prev);
              }}
              accessibilityRole="button"
            >
              <View style={styles.sectionIndicator} />
              <View style={styles.collapsibleText}>
                <Text style={styles.sectionTitle}>PAYMENTS INCLUDED</Text>
                <Text style={styles.collapsibleSubtitle}>
                  Select one or more payments to include in this bank deposit.
                </Text>
              </View>
              <Ionicons
                name={listExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>

            {/* No summary row here — the banner above already reports the
                selected count and total. */}

            {listExpanded ? (
              <View style={styles.listBody}>
                {/* Search */}
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  mode="outlined"
                  placeholder="Search party or invoice..."
                  textColor={COLORS.black}
                  style={styles.searchInput}
                  outlineStyle={styles.inputOutline}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  left={<TextInput.Icon icon="magnify" color={COLORS.textSecondary} />}
                  right={
                    search ? (
                      <TextInput.Icon
                        icon="close"
                        color={COLORS.textSecondary}
                        onPress={() => setSearch("")}
                      />
                    ) : undefined
                  }
                />

                {/* Filters — both columns are fixed-height so picking a value
                    never resizes the row. */}
                <View style={styles.filterRow}>
                  <View style={styles.filterCol}>
                    {Platform.OS === "web" ? (
                      <View style={styles.dateFilterBtn}>
                        <Ionicons
                          name="calendar-outline"
                          size={16}
                          color={COLORS.textSecondary}
                        />
                        {/* @ts-ignore — 'input' is valid on web */}
                        <input
                          type="date"
                          value={dateFilter}
                          onChange={(event: any) => setDateFilter(event.target.value)}
                          style={{
                            border: "none",
                            outline: "none",
                            fontSize: 13,
                            color: COLORS.black,
                            background: "transparent",
                            width: "100%",
                            marginLeft: 8,
                            cursor: "pointer",
                          }}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.dateFilterBtn}
                        activeOpacity={0.8}
                        onPress={() => setShowFilterDatePicker(true)}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={16}
                          color={COLORS.textSecondary}
                        />
                        <Text
                          style={[
                            styles.dateFilterText,
                            !dateFilter && styles.dateFilterPlaceholder,
                          ]}
                          numberOfLines={1}
                        >
                          {dateFilter || "Date"}
                        </Text>
                        {dateFilter ? (
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => setDateFilter("")}
                          >
                            <Ionicons
                              name="close-circle"
                              size={15}
                              color={COLORS.textMuted}
                            />
                          </TouchableOpacity>
                        ) : null}
                      </TouchableOpacity>
                    )}

                    {showFilterDatePicker ? (
                      <DateTimePicker
                        value={dateFilter ? new Date(dateFilter) : new Date()}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(_event, selectedDate) => {
                          setShowFilterDatePicker(false);
                          if (selectedDate) {
                            setDateFilter(selectedDate.toISOString().split("T")[0]);
                          }
                        }}
                      />
                    ) : null}
                  </View>

                  <View style={styles.filterCol}>
                    <Dropdown
                      label=""
                      data={PARTY_FILTERS}
                      value={partyFilter}
                      onChange={setPartyFilter}
                      placeholder="Party"
                      iconColor={COLORS.textSecondary}
                      noBottomSpacing
                    />
                  </View>
                </View>

                {/* Payment list */}
                <View style={styles.list}>
                  {visiblePayments.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="search-outline"
                        size={22}
                        color={COLORS.textMuted}
                      />
                      <Text style={styles.emptyText}>
                        No payments match the current filters.
                      </Text>
                    </View>
                  ) : (
                    visiblePayments.map((payment) => (
                      <DepositPaymentRow
                        key={payment.id}
                        payment={payment}
                        selected={selectedIds.includes(payment.id)}
                        onToggle={() => togglePayment(payment.id)}
                      />
                    ))
                  )}
                </View>

                {/* Date-range footer */}
                <View style={styles.rangeRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.rangeText}>
                    Showing payments from {DEPOSIT_DATE_RANGE.from} to{" "}
                    {DEPOSIT_DATE_RANGE.to}
                  </Text>
                  <TouchableOpacity style={styles.changeBtn} activeOpacity={0.8}>
                    <Text style={styles.changeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </Surface>

          {/* ── 3. Deposit summary ────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>DEPOSIT SUMMARY</Text>
            </View>

            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Selected Payments</Text>
              <Text style={styles.summaryLineValue}>{selectedIds.length}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Total Cash</Text>
              <Text style={styles.summaryLineValue}>₹{formatAmount(totalCash)}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Total Cheque</Text>
              <Text style={styles.summaryLineValue}>
                ₹{formatAmount(totalCheque)}
              </Text>
            </View>

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total Deposit</Text>
              <Text style={styles.grandTotalValue}>
                ₹{formatAmount(totalSelected)}
              </Text>
            </View>

          </Surface>

          {/* ── 4. Attachments ────────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>ATTACHMENTS</Text>
              <Text style={styles.sectionOptional}>Optional</Text>
            </View>

            <View style={styles.uploadRow}>
              <UploadCard
                title="Bank Deposit Slip"
                hint="Tap to Upload"
                icon="document-attach-outline"
                fileName={depositSlip}
                onPress={() => setDepositSlip("deposit-slip.jpg")}
                onClear={() => setDepositSlip(null)}
              />
              <UploadCard
                title="Deposit Receipt"
                hint="Tap to Upload"
                icon="receipt-outline"
                fileName={depositReceipt}
                onPress={() => setDepositReceipt("deposit-receipt.jpg")}
                onClear={() => setDepositReceipt(null)}
              />
            </View>
          </Surface>

          {/* ── 5. Remarks ────────────────────────────────────────────── */}
          <Surface style={[styles.section, styles.lastSection]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>REMARKS</Text>
            </View>

            <FormField
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add remarks about this deposit..."
              multiline
              optional
            />
          </Surface>
        </ScrollView>

        {/* ── Sticky submit ──────────────────────────────────────────── */}
        <View style={styles.bottomBar}>
          <Button
            mode="contained"
            onPress={() => {}}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            buttonColor={COLORS.success}
            textColor={COLORS.textLight}
            icon="bank-transfer-in"
          >
            Deposit to Bank
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  // Matches the Order Details header — flush against the navbar, rounded below.
  banner: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  bannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  bannerAmount: {
    flex: 1,
    textAlign: "right",
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  bannerSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
  },
  bannerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  bannerLabel: {
    color: "#fff",
    opacity: 0.95,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  balanceRow: {
    flexDirection: "row",
    flexShrink: 1,
    gap: SPACING.sm,
  },
  balanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  balanceChipText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    // Clears the sticky submit bar so the last card is fully reachable.
    paddingBottom: SPACING.xxl + SPACING.lg,
  },
  intro: {
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  introSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
  },
  lastSection: {
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  sectionOptional: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  sectionIndicator: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  collapsibleText: {
    flex: 1,
  },
  collapsibleSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  field: {
    marginBottom: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  required: {
    color: COLORS.error,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  inputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  webDateWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 56,
  },
  listBody: {
    marginTop: SPACING.md,
  },
  searchInput: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
    height: 48,
    marginBottom: SPACING.sm,
  },
  filterRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterCol: {
    flex: 1,
  },
  // Height matches the Dropdown beside it (56) so the row keeps a constant
  // height whether or not a date is picked.
  dateFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs + 2,
    height: 56,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  dateFilterText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
  },
  dateFilterPlaceholder: {
    fontWeight: "400",
    color: COLORS.textMuted,
  },
  list: {
    // The outer page scrolls; a nested scroll view here would fight it.
    marginBottom: SPACING.xs,
  },
  emptyState: {
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.lg,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs + 2,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  rangeText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  changeBtn: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm + 2,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  summaryLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs + 2,
  },
  summaryLineLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryLineValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  grandTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
  },
  uploadRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    // Extra bottom padding lifts the button clear of the global bottom nav bar.
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  submitBtn: {
    borderRadius: RADIUS.md,
  },
  submitContent: {
    height: 50,
  },
  submitLabel: {
    color: COLORS.textLight,
    fontWeight: "700",
    fontSize: 15,
  },
});
