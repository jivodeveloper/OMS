import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "react-native-paper";

import { appAlert } from "@/src/components/common/AppDialog";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import {
  advancePaymentService,
  type ApiRequest,
} from "@/src/services/advancePayment.service";

import AdvanceRequestForm from "../components/AdvanceRequestForm";
import type { FileAttachment } from "../logic/attachments";
import { failureMessage, showFailure } from "../showError";
import { fromApiRequest, toApiRequest } from "../logic/requestApi";
import { EMPTY_FORM, validate, type RequestForm } from "../logic/rules";

/**
 * The creator's edit of a request — and, for a returned one, the resubmission.
 *
 * A RETURNED request is edited and sent on again in ONE step: the server takes
 * `resubmit` on the edit, so the corrected request re-enters the route without
 * a second action the requester could forget. Files the server already holds
 * are listed beside newly picked ones; taking one off removes it on save.
 */
export default function AdvanceEditScreen() {
  // Back goes where this page was opened from - the list, or the details
  // page behind a progress page - never to the dashboard. See the hook.
  useBackToOrigin("/(main)/advance-payments/tracking");

  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = Number(id);

  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [removeFileIds, setRemoveFileIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** Empty required fields are marked once the requester has tried to save. */
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(requestId)) {
      setError("No request was named.");
      setLoading(false);
      return;
    }
    advancePaymentService
      .request(requestId)
      .then((api) => {
        if (!alive) return;
        const entry = fromApiRequest(api);
        setRequest(api);
        setForm(entry.form);
        setFiles(entry.files);
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
  }, [requestId]);

  // The automatic reading of SAP attachments is gone (2026-10-07) — see the
  // note in `AdvanceCreateScreen`. A document keeps whatever reading it was
  // saved with; nothing new is read.

  const { missing, problems } = validate(form);
  const blocking = problems[0] ?? (missing.length ? `${missing[0]} is still needed.` : "");
  const ready = blocking === "" && request !== null;
  const resubmit = request?.can.resubmit ?? false;

  const save = async () => {
    if (!request || !ready) {
      // Marked on the fields AND named in a dialog, exactly as on create.
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
    setError("");
    try {
      const picked = files
        .map((attachment) => attachment.file)
        .filter((file): file is NonNullable<typeof file> => file !== undefined);
      const saved = await advancePaymentService.editRequest(
        request.id,
        toApiRequest(form),
        {
          files: picked,
          removeFileIds,
          resubmit,
          version: request.flow?.version,
        },
      );
      appAlert(
        resubmit ? "Resubmitted" : "Saved",
        resubmit
          ? `${saved.request_no} is back with its approver.`
          : `${saved.request_no} has been updated.`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    } catch (err) {
      // Every reason the server gave, in a dialog — see the note on the create
      // screen.
      showFailure("Could not save", err);
      console.warn("[advance-payments] edit refused", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.centre}>
        <Ionicons name="cloud-offline-outline" size={44} color={COLORS.error} />
        <Text style={styles.errorTitle}>{error || "That request could not be read."}</Text>
      </View>
    );
  }

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
          {request.last_decision?.remarks ? (
            <View style={styles.returned}>
              <Text style={styles.returnedTitle}>
                {request.last_decision.label || request.last_decision.action} ·{" "}
                {request.last_decision.actor?.name ?? "—"}
              </Text>
              <Text style={styles.returnedText}>{request.last_decision.remarks}</Text>
            </View>
          ) : null}

          <AdvanceRequestForm
            form={form}
            setForm={setForm}
            files={files}
            setFiles={setFiles}
            showErrors={showErrors}
            onRemoveSavedFile={(serverId) =>
              setRemoveFileIds((current) =>
                current.includes(serverId) ? current : [...current, serverId],
              )
            }
          />
        </ScrollView>

        <View style={styles.bottomBar}>
          {!ready && !saving ? (
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.hintText}>{blocking}</Text>
            </View>
          ) : null}
          <Button
            mode="contained"
            onPress={save}
            disabled={saving}
            loading={saving}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            buttonColor={saving || !ready ? COLORS.borderLight : COLORS.primary}
            textColor={COLORS.textLight}
            icon="content-save-outline"
          >
            {saving ? "Saving…" : resubmit ? "Save & Resubmit" : "Save Changes"}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.sm, padding: SPACING.lg },
  errorTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  returned: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warning,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  returnedTitle: { fontSize: 12, fontWeight: "800", color: COLORS.warning },
  returnedText: { fontSize: 12, color: COLORS.text, marginTop: 4, lineHeight: 17 },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  submitBtn: { borderRadius: RADIUS.md },
  submitContent: { height: 50 },
  submitLabel: { color: COLORS.textLight, fontWeight: "700", fontSize: 15 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginBottom: SPACING.sm },
  hintText: { flex: 1, fontSize: 12, color: COLORS.textMuted },
});
