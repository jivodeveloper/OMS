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

import { showToast } from "@/src/components/common/Toast";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import backdateService from "@/src/services/backdate.service";
import { fromIso, toIsoInstant, toYMD } from "@/src/utils/datetime";
import BackDateRequestForm, {
  type BackDateFormState,
  emptyForm,
  firstProblem,
  joinActions,
  splitActions,
} from "../components/BackDateRequestForm";
import { messageFrom } from "../hooks/useBackDateMasters";

/**
 * Correct a request that has not been decided yet.
 *
 * Two people reach this screen: the requester, and the approver currently
 * holding it. The second is the point — when SAP refuses a grant, the approver
 * reading the error is the one who can fix it, and without this they would
 * have to reject and ask for the whole thing again.
 *
 * `can_edit` is the server's answer and is checked on load. The screen does not
 * re-derive it: the rule involves who holds the stage and whether SAP refused,
 * and a second copy would drift and offer a form that 403s on save.
 */
export default function BackDateEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);

  const [form, setForm] = useState<BackDateFormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const request = await backdateService.getRequest(id);
        if (cancelled) return;
        if (!request.can_edit) {
          setBlocked(
            "This request can no longer be edited. It has been decided, or it is not yours to change.",
          );
          return;
        }
        setForm({
          // The stored value is a canonical set; the form holds the list.
          companies: request.companies,
          sap_username: request.sap_username,
          document_type_name: request.document_type_name,
          actions: splitActions(request.action),
          from_date: fromIso(request.from_date),
          to_date: fromIso(request.to_date),
          time_limit: fromIso(request.time_limit),
          // Starts EMPTY, never seeded from an earlier remark: this is the
          // reason for THIS edit and it lands on this edit's own log row.
          // Prefilling would put somebody else's words in this user's mouth.
          remarks: "",
        });
      } catch (err) {
        if (!cancelled)
          setBlocked(messageFrom(err, "Could not load this request."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The same rules as Create, plus the one that differs: an edit's reason is
  // the sole record of why somebody changed another person's request, so
  // `firstProblem` requires it in this mode.
  const blocking = firstProblem(form, "edit");
  const ready = blocking === "";

  const save = async () => {
    if (!ready) {
      setError(blocking);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await backdateService.updateRequest(id, {
        sap_username: form.sap_username.trim(),
        document_type_name: form.document_type_name.trim(),
        action: joinActions(form.actions),
        from_date: toYMD(form.from_date!),
        to_date: toYMD(form.to_date!),
        time_limit: toIsoInstant(form.time_limit!),
        remarks: form.remarks.trim(),
      });
      showToast("Request updated.", "success");
      // STRAIGHT TO THIS REQUEST'S DETAILS, not back.
      //
      // `router.back()` returns to whatever was underneath, which is the
      // tracking list when the edit was opened from there and the HOME screen
      // when it was reached any other way — so saving a change could land the
      // user nowhere near the thing they had just changed.
      //
      // `replace`, not `push`: the edit form has served its purpose and should
      // not sit in the stack for Back to return to. `refreshAt` changes on
      // every save, which is what makes the details screen refetch rather than
      // redisplay the copy it already had.
      router.replace({
        pathname: "/(main)/backdate/tracking-details",
        params: { id: String(id), refreshAt: String(Date.now()) },
      } as never);
    } catch (err) {
      setError(messageFrom(err, "The change could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={styles.centered}>
        <Ionicons
          name="lock-closed-outline"
          size={36}
          color={COLORS.textMuted}
        />
        <Text style={styles.blockedText}>{blocked}</Text>
        <Button mode="outlined" onPress={() => router.back()}>
          Go back
        </Button>
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
          <View style={styles.intro}>
            <Text style={styles.title}>Edit request #{id}</Text>
            <Text style={styles.subtitle}>
              Every change is recorded against you in the request&rsquo;s
              history, with what it was before.
            </Text>
          </View>

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

          <BackDateRequestForm form={form} setForm={setForm} mode="edit" />
        </ScrollView>

        <View style={styles.bottomBar}>
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
            onPress={save}
            disabled={saving || !ready}
            loading={saving}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={[
              styles.submitLabel,
              !ready && !saving && styles.submitLabelOff,
            ]}
            buttonColor={saving || !ready ? COLORS.borderLight : COLORS.primary}
            textColor={COLORS.textLight}
            icon="content-save-outline"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl + SPACING.lg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  blockedText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  intro: { marginBottom: SPACING.md },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginTop: 4,
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
