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
import { Button, Surface } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import FormField from "./components/FormField";
import PaymentMethodCard from "./components/PaymentMethodCard";
import PaymentSummary from "./components/PaymentSummary";
import {
  PARTY_OPTIONS,
  RECEIVED_FROM_OPTIONS,
  type PayToType,
} from "./constants";
import { validateCashBreakdown } from "./validation";
import type { PaymentMethodEntry, ReceivePaymentForm } from "./types";

// Android needs this opt-in for LayoutAnimation to run at all.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Flat grey stand-in for the primary gradient while submit is blocked. */
const DISABLED_GRADIENT = [COLORS.textMuted, COLORS.textMuted] as const;

let methodCounter = 0;

const createMethod = (): PaymentMethodEntry => {
  methodCounter += 1;
  return {
    id: `method-${methodCounter}-${Date.now()}`,
    method: "cash",
    amount: "",
    noteRows: [],
    attachments: [],
  };
};

const INITIAL_METHOD = createMethod();

export default function ReceivePaymentScreen() {
  const [form, setForm] = useState<ReceivePaymentForm>({
    receivedFrom: null,
    party: null,
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

  const partyOptions = form.receivedFrom ? PARTY_OPTIONS[form.receivedFrom] : [];

  const handleReceivedFromChange = (value: PayToType) => {
    // Switching the source invalidates the current party — the lists don't overlap.
    setForm((prev) => ({ ...prev, receivedFrom: value, party: null }));
  };

  /**
   * The currently open card, when it has an unbalanced cash breakdown. While one
   * exists the accordion is pinned to it — opening another card (or adding one)
   * would collapse the error out of view before it has been fixed.
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
          {/* ── Payment details ───────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Received From"
                data={RECEIVED_FROM_OPTIONS}
                value={form.receivedFrom}
                onChange={handleReceivedFromChange}
                placeholder="Select source..."
                searchable={false}
                leftIcon="swap-horizontal-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Party"
                data={partyOptions}
                value={form.party}
                onChange={(value) => setForm((prev) => ({ ...prev, party: value }))}
                placeholder={
                  form.receivedFrom
                    ? "Select party..."
                    : "Select “Received From” first"
                }
                disabled={!form.receivedFrom}
                leftIcon="person-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <FormField
              label="Remarks"
              value={form.remarks}
              onChangeText={(text) => setForm((prev) => ({ ...prev, remarks: text }))}
              placeholder="Add a note for this payment"
              multiline
              optional
            />
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
        </ScrollView>

        {/* ── Sticky submit, raised clear of the global bottom bar ────── */}
        <View style={styles.bottomBar}>
          {submitBlocked ? (
            <View style={styles.submitWarning}>
              <Ionicons name="alert-circle" size={14} color={COLORS.error} />
              <Text style={styles.submitWarningText}>
                Cash note breakdown must equal the amount entered.
              </Text>
            </View>
          ) : null}
          <LinearGradient
            colors={submitBlocked ? DISABLED_GRADIENT : GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.submitGradient}
          >
            <Button
              mode="contained"
              onPress={() => {}}
              disabled={submitBlocked}
              style={styles.submitBtn}
              contentStyle={styles.submitContent}
              labelStyle={[
                styles.submitLabel,
                submitBlocked && styles.submitLabelDisabled,
              ]}
              buttonColor="transparent"
              textColor={COLORS.textLight}
              icon="check-circle-outline"
            >
              Submit Payment
            </Button>
          </LinearGradient>
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
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
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
  submitGradient: {
    borderRadius: RADIUS.md,
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
  submitLabelDisabled: {
    // Paper dims a disabled label; keep it legible against the grey fill.
    color: COLORS.textLight,
    opacity: 0.9,
  },
});
