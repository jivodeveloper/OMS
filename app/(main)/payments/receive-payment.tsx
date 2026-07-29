import React, { useCallback, useState } from "react";
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
import { Button, Checkbox, Surface } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import FormField from "./_components/FormField";
import PaymentMethodCard from "./_components/PaymentMethodCard";
import PaymentSummary from "./_components/PaymentSummary";
import {
  COMPANY_OPTIONS,
  invoicesForParty,
  PARTY_OPTIONS,
  PARTY_SOURCE,
  RECEIVED_FROM_OPTIONS,
} from "./_lib/constants";
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

export default function ReceivePaymentScreen() {
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
  const invoiceOptions = invoicesForParty(form.party);

  const handleReceivedFromChange = (value: string) => {
    animate();
    setForm((prev) => ({ ...prev, receivedFrom: value }));
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

  // Submit is gated on EVERY card, not just the open one — a collapsed card can
  // still hold an unbalanced breakdown.
  const submitBlocked = form.methods.some(
    (entry) => validateCashBreakdown(entry) !== null,
  );

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
                data={COMPANY_OPTIONS}
                value={form.company}
                onChange={(value) => setForm((prev) => ({ ...prev, company: value }))}
                placeholder="Select company..."
                searchable={false}
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Received From"
                data={RECEIVED_FROM_OPTIONS}
                value={form.receivedFrom}
                onChange={handleReceivedFromChange}
                placeholder="Select source..."
                leftIcon="swap-horizontal-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            {/* Always shown: the money originates from a party either way. */}
            <View style={styles.field}>
              <Dropdown
                label="Party"
                data={PARTY_OPTIONS}
                value={form.party}
                onChange={handlePartyChange}
                placeholder="Select party..."
                leftIcon="person-outline"
                iconColor={COLORS.textSecondary}
                required
              />
              {form.receivedFrom && !isPartySource ? (
                <Text style={styles.fieldHint}>
                  Collected by{" "}
                  {
                    RECEIVED_FROM_OPTIONS.find(
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
                    : form.party
                      ? "Select invoice..."
                      : "Select a party first"
                }
                disabled={form.isAdvance || !form.party}
                leftIcon="receipt-outline"
                iconColor={COLORS.textSecondary}
              />
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

          {form.methods.map((entry, index) => (
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
            style={[styles.addMethodBtn, blockingEntry && styles.addMethodDisabled]}
            activeOpacity={0.8}
            disabled={!!blockingEntry}
            onPress={addMethod}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={blockingEntry ? COLORS.textMuted : COLORS.primary}
            />
            <Text
              style={[
                styles.addMethodLabel,
                blockingEntry && styles.addMethodLabelDisabled,
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
          {submitBlocked ? (
            <View style={styles.submitWarning}>
              <Ionicons name="alert-circle" size={14} color={COLORS.error} />
              <Text style={styles.submitWarningText}>
                Denominations must equal the amount entered.
              </Text>
            </View>
          ) : null}
          <Button
            mode="contained"
            onPress={() => {}}
            disabled={submitBlocked}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            buttonColor={submitBlocked ? COLORS.textMuted : COLORS.success}
            textColor={COLORS.textLight}
            icon="check-circle-outline"
          >
            Receive Payment
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
  submitWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs + 2,
    marginBottom: SPACING.sm,
  },
  submitWarningText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.error,
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
