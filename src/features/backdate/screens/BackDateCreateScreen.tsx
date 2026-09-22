import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "react-native-paper";

import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import backdateService from "@/src/services/backdate.service";
import { toIsoInstant, toYMD } from "@/src/utils/datetime";
import BackDateRequestForm, {
  type BackDateFormState,
  emptyForm,
  firstProblem,
  joinActions,
} from "../components/BackDateRequestForm";
import BackDateSuccessDialog from "../components/BackDateSuccessDialog";
import { messageFrom } from "../hooks/useBackDateMasters";

/**
 * Raise a request for temporary back-posting rights in SAP.
 *
 * Laid out like Receive Payment: an intro, stacked `Surface` sections, and a
 * sticky submit bar. The form body itself is shared with the edit screen.
 */
export default function BackDateCreateScreen() {
  const [form, setForm] = useState<BackDateFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<number | null>(null);

  /**
   * Everything the server will reject, checked here so nobody round-trips.
   *
   * Shared with the form, which is what lets the button, the hint under it and
   * the guard inside `submit` agree on a single answer.
   */
  const blocking = firstProblem(form, "create");
  const ready = blocking === "";

  const submit = async () => {
    // The button is disabled unless `ready`, so this only fires on a race —
    // but a disabled button is a UI affordance, not a guarantee, and the
    // request being guarded here writes rights into SAP.
    if (!ready) {
      setError(blocking);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const request = await backdateService.createRequest({
        company: form.companies,
        sap_username: form.sap_username.trim(),
        document_type_name: form.document_type_name.trim(),
        action: joinActions(form.actions),
        // Local calendar dates — never `toISOString().split("T")[0]`, which
        // would send yesterday for anyone picking before 05:30 local.
        from_date: toYMD(form.from_date!),
        to_date: toYMD(form.to_date!),
        // An INSTANT. The picker holds a `Date`, so the wall clock the user
        // read is converted once, here, and the server is left nothing to
        // assume about which timezone it meant.
        time_limit: toIsoInstant(form.time_limit!),
        remarks: form.remarks.trim(),
      });
      setCreated(request.id);
    } catch (err) {
      setError(messageFrom(err, "The request could not be submitted."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={COLORS.error}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <BackDateRequestForm form={form} setForm={setForm} mode="create" />
        </ScrollView>

        <View style={styles.bottomBar}>
          {/* A dead button with no explanation is the worst of both: the user
              cannot submit and cannot tell what is missing. The next thing to
              answer is named here, and it updates as they go. */}
          {!ready && !saving ? (
            <View style={styles.hintRow}>
              <Ionicons
                name="information-circle-outline"
                size={14}
                color={COLORS.textMuted}
              />
              <Text style={styles.hintText}>{blocking}</Text>
            </View>
          ) : null}

          <Button
            mode="contained"
            onPress={submit}
            disabled={saving || !ready}
            loading={saving}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={[
              styles.submitLabel,
              !ready && !saving && styles.submitLabelOff,
            ]}
            buttonColor={saving || !ready ? COLORS.borderLight : COLORS.success}
            textColor={COLORS.textLight}
            icon="check-circle-outline"
          >
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* The dialog owns what happens next, so the redirect cannot fire before
          the user has seen the request number. */}
      <BackDateSuccessDialog
        visible={created !== null}
        requestNo={created !== null ? `#${created}` : ""}
        onDone={() => {
          setCreated(null);
          setForm(emptyForm());
          // THE TRACKING LIST, which is where a create lands everywhere else
          // in the app — a payment goes to payment tracking, a deposit to
          // deposit tracking, and only an EDIT goes to the one document it
          // changed. This screen used to open the new request's details page
          // instead, which left the user a level deeper than the equivalent
          // flow beside it and with no sight of the queue they just joined.
          //
          // replace(), so Back does not return to a form already submitted.
          // No refresh param is needed: the list refetches on focus (see
          // `hooks/useRefreshOnFocus`), so the new request is there whether
          // the screen was already mounted or not.
          router.replace("/(main)/backdate/tracking" as never);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl + SPACING.lg,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    backgroundColor: COLORS.errorLight,
    borderColor: COLORS.errorBorder,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, color: COLORS.error },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  submitBtn: { borderRadius: RADIUS.md },
  submitContent: { height: 50 },
  submitLabel: { color: COLORS.textLight, fontWeight: "700", fontSize: 15 },
  submitLabelOff: { color: COLORS.textMuted },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  hintText: { flex: 1, fontSize: 12, color: COLORS.textMuted },
});
