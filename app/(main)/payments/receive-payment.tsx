import React, { useCallback, useState } from "react";
import {
  Alert,
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
import { Button, Checkbox, Surface } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import FormField from "./_components/FormField";
import PaymentMethodCard from "./_components/PaymentMethodCard";
import PaymentSummary from "./_components/PaymentSummary";
import {
  messageFrom,
  useCompanies,
  useCollectionPersons,
  useOpenInvoices,
  useParties,
} from "@/src/features/payments/usePaymentMasters";
import usePaymentPermissions from "@/src/features/payments/usePaymentPermissions";
import paymentsService, {
  type Company,
} from "@/src/services/payments.service";
import { PARTY_SOURCE } from "./_lib/constants";
import { validateCashBreakdown } from "./_lib/validation";
import type { PaymentMethodEntry, ReceivePaymentForm } from "./_lib/types";

// Android needs this opt-in for LayoutAnimation to run at all.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

let methodCounter = 0;

const createMethod = (): PaymentMethodEntry => {
  methodCounter += 1;
  return {
    id: `method-${methodCounter}-${Date.now()}`,
    method: "cash",
    amount: "",
    noteRows: [],
    notesExpanded: true,
    chequeNumber: "",
    bankName: "",
    chequeDate: "",
    attachments: [],
  };
};

const INITIAL_METHOD = createMethod();

/** Permission gate — the screen only mounts for users who may open it. */
export default function ReceivePaymentRoute() {
  return (
    <ScreenGuard screen="payments/receive-payment">
      <ReceivePaymentScreen />
    </ScreenGuard>
  );
}

function ReceivePaymentScreen() {
  const [form, setForm] = useState<ReceivePaymentForm>({
    company: null,
    receivedFrom: null,
    party: null,
    invoice: null,
    isAdvance: false,
    remarks: "",
    methods: [INITIAL_METHOD],
  });

  // Only one card open at a time keeps the screen short — that's the point of the
  // accordion here. Null means every card is collapsed.
  const [expandedId, setExpandedId] = useState<string | null>(INITIAL_METHOD.id);
  const [saving, setSaving] = useState(false);

  // ── Live master data ──────────────────────────────────────────────────
  // Every list below comes from the backend, so a company or collector added
  // in the web admin shows up here without an app release. The cascade is
  // driven by the current selection: parties reload when the company changes,
  // invoices when the party does.
  const companies = useCompanies();
  const selectedCompany = (form.company as Company | null) ?? null;
  const collectors = useCollectionPersons(selectedCompany);
  const parties = useParties(selectedCompany);
  const invoices = useOpenInvoices(selectedCompany, form.party);
  const permissions = usePaymentPermissions();

  // "Party" is a sentinel meaning the money came straight from the party;
  // every other option is a person who collected it on their behalf.
  const receivedFromOptions = [
    { label: "Party", value: PARTY_SOURCE },
    ...collectors.options,
  ];

  const animate = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
  }, []);

  // A party is involved either way — "Party" means the money came straight from
  // them, a named person means that person collected it on the party's behalf —
  // so the Party dropdown is always shown. The hint below it explains which.
  const isPartySource = form.receivedFrom === PARTY_SOURCE;
  const invoiceOptions = invoices.options;

  const handleReceivedFromChange = (value: string) => {
    animate();
    setForm((prev) => ({ ...prev, receivedFrom: value }));
  };

  /** Changing company invalidates everything downstream of it. */
  const handleCompanyChange = (value: string) => {
    animate();
    setForm((prev) => ({
      ...prev,
      company: value,
      receivedFrom: null,
      party: null,
      invoice: null,
    }));
  };

  const handlePartyChange = (value: string) => {
    // Invoices belong to a party, so a different party invalidates the choice.
    setForm((prev) => ({ ...prev, party: value, invoice: null }));
  };

  const toggleAdvance = () => {
    animate();
    setForm((prev) => ({
      ...prev,
      isAdvance: !prev.isAdvance,
      // An advance isn't tied to an invoice, so clear any prior selection.
      invoice: !prev.isAdvance ? null : prev.invoice,
    }));
  };

  /**
   * The open card, when its denominations don't add up to the amount entered.
   * While one exists the accordion is pinned to it — opening another card (or
   * adding one) would collapse the error out of view before it's been fixed.
   */
  const blockingEntry = form.methods.find(
    (entry) => entry.id === expandedId && validateCashBreakdown(entry) !== null,
  );

  /**
   * Progressive disclosure: Company → Received From → Party → Invoice, then the
   * payment methods. Each field unlocks only once the one before it is answered,
   * so a later choice can never be made against a stale earlier one.
   */
  const canPickReceivedFrom = !!form.company;
  const canPickParty = canPickReceivedFrom && !!form.receivedFrom;
  // The invoice list hangs off the party, and an advance isn't invoice-linked.
  const canPickInvoice = canPickParty && !!form.party && !form.isAdvance;
  const headerComplete =
    canPickParty && !!form.party && (form.isAdvance || !!form.invoice);

  // Every method needs an amount before this can be submitted.
  const allMethodsHaveAmount = form.methods.every(
    (entry) => (Number(entry.amount) || 0) > 0,
  );

  // Can't add a method while one is unbalanced, or before the details are set.
  const addDisabled = !!blockingEntry || !headerComplete;

  // Submit is gated on EVERY card, not just the open one — a collapsed card can
  // still hold an unbalanced breakdown.
  const submitBlocked =
    !headerComplete ||
    !allMethodsHaveAmount ||
    saving ||
    // The server rejects a create without this grant; disabling the button
    // means the user is told before filling the form, not after.
    !permissions.canCreatePayment ||
    form.methods.some((entry) => validateCashBreakdown(entry) !== null);

  /**
   * Create the receipt and send it straight into the approval chain.
   *
   * Create + submit are two calls because the API models them separately (a
   * draft can exist unsubmitted). If the submit fails the receipt still exists
   * as a draft rather than being lost, so the message says so explicitly.
   */
  const handleSubmit = async () => {
    if (submitBlocked || saving) return;
    setSaving(true);
    try {
      const selectedParty = parties.data.find((p) => p.card_code === form.party);
      const methods = form.methods.map((entry) => {
        const base = {
          method: entry.method.toUpperCase() as "CASH" | "UPI" | "CHEQUE",
          amount: String(Number(entry.amount) || 0),
        };
        if (entry.method === "cash") {
          return {
            ...base,
            denominations: entry.noteRows
              .filter((row) => row.denomination && Number(row.quantity) > 0)
              .map((row) => ({
                denomination: Number(row.denomination),
                quantity: Number(row.quantity),
              })),
          };
        }
        if (entry.method === "cheque") {
          return {
            ...base,
            cheque_number: entry.chequeNumber,
            bank_name: entry.bankName,
            cheque_date: entry.chequeDate || undefined,
          };
        }
        return base;
      });

      const totalAmount = form.methods.reduce(
        (sum, entry) => sum + (Number(entry.amount) || 0),
        0,
      );

      const receipt = await paymentsService.createReceipt({
        company: selectedCompany as Company,
        card_code: form.party as string,
        card_name: selectedParty?.card_name ?? "",
        payment_date: new Date().toISOString().slice(0, 10),
        received_from_type: isPartySource ? "PARTY" : "PERSON",
        received_from_person: isPartySource ? null : Number(form.receivedFrom),
        is_advance: form.isAdvance,
        remarks: form.remarks,
        methods,
        // An advance is not invoice-linked, so it carries no allocation.
        allocations:
          form.isAdvance || !form.invoice
            ? []
            : [
                {
                  sap_doc_entry: Number(form.invoice),
                  amount_applied: String(totalAmount),
                },
              ],
      });

      try {
        await paymentsService.submitReceipt(receipt.id);
      } catch (err) {
        Alert.alert(
          "Saved as draft",
          `${receipt.receipt_no} was created but could not be submitted: ${messageFrom(err)}. Submit it again from the payments list.`,
        );
        return;
      }

      Alert.alert(
        "Payment recorded",
        `${receipt.receipt_no} has been submitted for approval.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert("Could not record payment", messageFrom(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleMethod = (id: string) => {
    if (blockingEntry) return;
    animate();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const updateMethod = (id: string, patch: Partial<PaymentMethodEntry>) => {
    setForm((prev) => ({
      ...prev,
      methods: prev.methods.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const addMethod = () => {
    if (blockingEntry) return;
    const entry = createMethod();
    animate();
    setForm((prev) => ({ ...prev, methods: [...prev.methods, entry] }));
    // Open the new card so the user lands straight in it.
    setExpandedId(entry.id);
  };

  const removeMethod = (id: string) => {
    animate();
    setForm((prev) => ({
      ...prev,
      methods: prev.methods.filter((entry) => entry.id !== id),
    }));
    setExpandedId((prev) => (prev === id ? null : prev));
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Fixed total banner, flush under the navbar ──────────────── */}
        <PaymentSummary methods={form.methods} />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Screen intro ──────────────────────────────────────────── */}
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Receive Payment</Text>
            <Text style={styles.introSubtitle}>
              Record a payment received from a party or company user.
            </Text>
          </View>

          {/* ── Payment details ───────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Company"
                data={companies.options}
                value={form.company}
                onChange={handleCompanyChange}
                placeholder={
                  companies.loading
                    ? "Loading companies..."
                    : companies.options.length === 0
                      ? "No companies configured"
                      : "Select company..."
                }
                disabled={companies.loading || companies.options.length === 0}
                searchable={false}
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
              {companies.error ? (
                <Text style={styles.fieldError}>{companies.error}</Text>
              ) : !companies.loading && companies.options.length === 0 ? (
                <Text style={styles.fieldHint}>
                  No company is mapped to a SAP database yet. Ask an
                  administrator to add one before taking payments.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Received From"
                data={receivedFromOptions}
                value={form.receivedFrom}
                onChange={handleReceivedFromChange}
                placeholder={
                  !canPickReceivedFrom
                    ? "Select a company first"
                    : collectors.loading
                      ? "Loading..."
                      : "Select source..."
                }
                disabled={!canPickReceivedFrom || collectors.loading}
                leftIcon="swap-horizontal-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            {/* Always shown: the money originates from a party either way. */}
            <View style={styles.field}>
              <Dropdown
                label="Party"
                data={parties.options}
                value={form.party}
                onChange={handlePartyChange}
                placeholder={
                  !canPickParty
                    ? "Select “Received From” first"
                    : parties.loading
                      ? "Loading parties..."
                      : parties.options.length === 0
                        ? "No parties assigned"
                        : "Select party..."
                }
                disabled={!canPickParty || parties.loading}
                leftIcon="person-outline"
                iconColor={COLORS.textSecondary}
                required
              />
              {parties.error ? (
                <Text style={styles.fieldError}>{parties.error}</Text>
              ) : form.receivedFrom && !isPartySource ? (
                <Text style={styles.fieldHint}>
                  Collected by{" "}
                  {
                    receivedFromOptions.find(
                      (option) => option.value === form.receivedFrom,
                    )?.label
                  }{" "}
                  on behalf of this party.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Invoice"
                data={invoiceOptions}
                value={form.invoice}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, invoice: value }))
                }
                placeholder={
                  form.isAdvance
                    ? "Not applicable for advance"
                    : !canPickInvoice
                      ? "Select a party first"
                      : invoices.loading
                        ? "Loading open invoices..."
                        : invoices.options.length === 0
                          ? "No open invoices"
                          : "Select invoice..."
                }
                disabled={!canPickInvoice || invoices.loading}
                leftIcon="receipt-outline"
                iconColor={COLORS.textSecondary}
              />
              {invoices.error ? (
                <Text style={styles.fieldError}>{invoices.error}</Text>
              ) : canPickInvoice &&
                !invoices.loading &&
                invoices.options.length === 0 ? (
                <Text style={styles.fieldHint}>
                  This party has no open invoices. Tick “Advance payment” to
                  record it without one.
                </Text>
              ) : null}
            </View>

            {/* Advance payments aren't linked to an invoice. */}
            <TouchableOpacity
              style={styles.checkboxRow}
              activeOpacity={0.8}
              onPress={toggleAdvance}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.isAdvance }}
            >
              <Checkbox.Android
                status={form.isAdvance ? "checked" : "unchecked"}
                onPress={toggleAdvance}
                color={COLORS.primary}
                uncheckedColor={COLORS.textMuted}
              />
              <View style={styles.checkboxText}>
                <Text style={styles.checkboxLabel}>Receive payment as Advance</Text>
                <Text style={styles.checkboxHint}>Not linked to an invoice</Text>
              </View>
            </TouchableOpacity>
          </Surface>

          {/* ── Payment method accordions ─────────────────────────────── */}
          <View style={styles.methodsHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>PAYMENT METHODS</Text>
          </View>

          {/* Locked until the details above are set — entering amounts against
              an unset party/invoice would let a later change invalidate them. */}
          {!headerComplete ? (
            <View style={styles.lockedNotice}>
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={COLORS.textMuted}
              />
              <Text style={styles.lockedNoticeText}>
                Select Company, Received From, Party and Invoice (or mark it as an
                advance) to add payment methods.
              </Text>
            </View>
          ) : null}

          {headerComplete && form.methods.map((entry, index) => (
            <PaymentMethodCard
              key={entry.id}
              entry={entry}
              index={index}
              expanded={expandedId === entry.id}
              canRemove={form.methods.length > 1}
              onToggle={() => toggleMethod(entry.id)}
              onChange={(patch) => updateMethod(entry.id, patch)}
              onRemove={() => removeMethod(entry.id)}
            />
          ))}

          {/* Always below the last card, so adding another never means
              scrolling back up. */}
          <TouchableOpacity
            style={[styles.addMethodBtn, addDisabled && styles.addMethodDisabled]}
            activeOpacity={0.8}
            disabled={addDisabled}
            onPress={addMethod}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={addDisabled ? COLORS.textMuted : COLORS.primary}
            />
            <Text
              style={[
                styles.addMethodLabel,
                addDisabled && styles.addMethodLabelDisabled,
              ]}
            >
              Add Payment Method
            </Text>
          </TouchableOpacity>

          {/* ── Remarks ───────────────────────────────────────────────── */}
          <Surface style={[styles.section, styles.remarksSection]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>REMARKS</Text>
            </View>

            <FormField
              label="Remarks"
              value={form.remarks}
              onChangeText={(text) => setForm((prev) => ({ ...prev, remarks: text }))}
              placeholder="Enter remarks (optional)..."
              multiline
              optional
            />
          </Surface>
        </ScrollView>

        {/* ── Sticky submit, raised clear of the global bottom bar ────── */}
        <View style={styles.bottomBar}>
          {/* No inline warning for an incomplete form — the disabled button is
              the signal, and progressive unlocking shows what is outstanding.
              A MISSING PERMISSION is different: nothing the user does on this
              screen would fix it, so it has to be stated. */}
          {!permissions.loading && !permissions.canCreatePayment ? (
            <Text style={styles.permissionNote}>
              You do not have permission to record payments. Ask an
              administrator for the “Payments — Create” permission.
            </Text>
          ) : null}
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={submitBlocked}
            loading={saving}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            buttonColor={submitBlocked ? COLORS.textMuted : COLORS.success}
            textColor={COLORS.textLight}
            icon="check-circle-outline"
          >
            {saving ? "Recording..." : "Receive Payment"}
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
  scrollContent: {
    paddingHorizontal: SPACING.md,
    // The banner's rounded bottom corners need a little breathing room before
    // the first card starts.
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
  remarksSection: {
    marginTop: SPACING.md,
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  methodsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm + 2,
    marginLeft: SPACING.xs,
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
  field: {
    marginBottom: SPACING.sm,
  },
  fieldHint: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  fieldError: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.error,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  permissionNote: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.error,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingRight: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  checkboxText: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  checkboxHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  addMethodBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.borderDashed,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  addMethodLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  addMethodDisabled: {
    backgroundColor: COLORS.inputBackground,
    borderColor: COLORS.border,
  },
  addMethodLabelDisabled: {
    color: COLORS.textMuted,
  },
  // ── Locked-section notice ──
  lockedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
  },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    // Extra bottom padding lifts the button clear of the global bottom nav bar
    // that sits underneath every screen.
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
