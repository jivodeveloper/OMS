import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "react-native-paper";

import { appAlert } from "@/src/components/common/AppDialog";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { advancePaymentService } from "@/src/services/advancePayment.service";

import AdvanceRequestForm from "../components/AdvanceRequestForm";
import { takeDraftFor } from "../draftHandover";
import { showFailure } from "../showError";
import type { FileAttachment } from "../logic/attachments";
import { toApiRequest } from "../logic/requestApi";
import { EMPTY_FORM, validate, type RequestForm } from "../logic/rules";

/**
 * Raise an advance payment request.
 *
 * Saved and routed to its first approver in one call, exactly as on the web —
 * `POST /advance-payments/requests/` takes the request as JSON beside its
 * files, and the workflow engine picks the route from the department.
 */
export default function AdvanceCreateScreen() {
  // Back goes where this page was opened from - the list, or the details
  // page behind a progress page - never to the dashboard. See the hook.
  useBackToOrigin("/(main)/advance-payments/tracking");

  /**
   * Filled from an assigned bill or PO, when the list sent one.
   *
   * The LIST builds the form, because that is where the document is read live
   * from SAP and where one no longer open has to be refused; this screen only
   * picks it up, by the assignment id in the route. See `draftHandover`.
   */
  const { assignment } = useLocalSearchParams<{ assignment?: string }>();
  const [form, setForm] = useState<RequestForm>(
    () => takeDraftFor(Number(assignment)) ?? EMPTY_FORM,
  );
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  /**
   * Whether the empty required fields are marked yet.
   *
   * The button stays tappable so that tapping it ANSWERS the question "what is
   * missing?" — a dead button with a hint under it makes the requester hunt for
   * the field, and on a long form that is most of the form.
   */
  const [showErrors, setShowErrors] = useState(false);

  // THE AUTOMATIC READING OF SAP ATTACHMENTS IS GONE (2026-10-07), on both
  // clients. It was OCR on a scan — ~10 s a page, every time a document was
  // ticked — to prefill a comparison nobody acted on, and on a phone's network
  // it was the slowest thing the form did. A request raised before then keeps
  // the reading saved with it, and the details screen still shows that.

  const { missing, problems } = validate(form);
  const blocking = problems[0] ?? (missing.length ? `${missing[0]} is still needed.` : "");
  const ready = blocking === "";

  const clearForm = () => {
    appAlert("Clear this form?", "Everything filled in so far will be lost.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setForm(EMPTY_FORM);
          setFiles([]);
          setShowErrors(false);
        },
      },
    ]);
  };

  const submit = async () => {
    // Tapping while something is missing MARKS the gaps rather than submitting:
    // the same `validate()` the server uses decides, so nothing reaches the API
    // that it would refuse.
    if (!ready) {
      // Mark the empty fields AND say what they are, in the dialog: the same
      // `validate()` the server uses decides both, so this list and a server
      // refusal can never disagree.
      setShowErrors(true);
      appAlert(
        "Check the form",
        // BOTH, never one or the other: a form can have something WRONG
        // in it (a date in the past) AND something still EMPTY, and
        // showing only the first means the requester fixes it, taps
        // Submit and is stopped again by what was already known.
        [
          ...problems,
          ...(missing.length
            ? [`Still needed:\n• ${missing.join("\n• ")}`]
            : []),
        ].join("\n"),
      );
      return;
    }
    setSaving(true);
    try {
      const picked = files
        .map((attachment) => attachment.file)
        .filter((file): file is NonNullable<typeof file> => file !== undefined);
      const request = await advancePaymentService.createRequest(
        toApiRequest(form),
        picked,
      );
      appAlert("Request submitted", `${request.request_no} is with its first approver.`, [
        {
          text: "Done",
          onPress: () => {
            setForm(EMPTY_FORM);
            setFiles([]);
            setShowErrors(false);
            // The list, which is where every other create lands, and
            // `replace` so Back does not return to a submitted form. It
            // refetches on focus, so the new request is there.
            router.replace("/(main)/advance-payments/tracking" as never);
          },
        },
      ]);
    } catch (err) {
      // EVERY reason the server gave, IN A DIALOG. Its `errors.problems` name
      // the field — "Choose a Sub-department of Finance.", "Document 10256:
      // 2000 is more than the 1500 still open." — and a banner at the top of a
      // long scroll is a message nobody reads with a thumb on Submit.
      showFailure("Could not submit", err);
      // Also in the log, with the endpoint, for chasing a failure that is not
      // about the form at all (a workflow with no stages, SAP down).
      console.warn("[advance-payments] create refused", err);
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
          <AdvanceRequestForm
            form={form}
            setForm={setForm}
            files={files}
            setFiles={setFiles}
            showErrors={showErrors}
          />
        </ScrollView>

        <View style={styles.bottomBar}>
          {!ready && !saving ? (
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.hintText}>{blocking}</Text>
            </View>
          ) : null}
          <View style={styles.actionRow}>
            {/* Start again — the cross alone. It is the smaller of the two
                actions and sits out of the thumb's path to Submit; the
                confirmation behind it is what makes a mistaken tap harmless. */}
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={clearForm}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Clear the form"
            >
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <Button
              mode="contained"
              onPress={submit}
              disabled={saving}
              loading={saving}
              style={styles.submitBtn}
              contentStyle={styles.submitContent}
              labelStyle={styles.submitLabel}
              buttonColor={saving || !ready ? COLORS.borderLight : COLORS.success}
              textColor={COLORS.textLight}
              icon="check-circle-outline"
            >
              {saving ? "Submitting…" : "Submit"}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  actionRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  submitBtn: { flex: 1, borderRadius: RADIUS.md },
  submitContent: { height: 50 },
  submitLabel: { color: COLORS.textLight, fontWeight: "700", fontSize: 15 },
  clearBtn: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  hintText: { flex: 1, fontSize: 12, color: COLORS.textMuted },
});
