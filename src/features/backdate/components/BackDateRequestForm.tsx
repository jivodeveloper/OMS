import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Checkbox, Surface, TextInput } from "react-native-paper";

import FormField from "@/app/(main)/payments/_components/FormField";
import DateTimeField from "@/src/components/common/DateTimeField";
import Dropdown from "@/src/components/common/DropdownProps";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import {
  BACKDATE_COMPANIES,
  type BackDateActionValue,
  type BackDateCompany,
} from "@/src/services/backdate.service";
import { formatDate, toYMD } from "@/src/utils/datetime";
import useBackDateMasters from "../hooks/useBackDateMasters";

export interface BackDateFormState {
  company: BackDateCompany;
  sap_username: string;
  document_type_name: string;
  /** The two tick boxes. Both ticked is ONE request carrying "A,U". */
  actions: ("A" | "U")[];
  from_date: Date | null;
  to_date: Date | null;
  /** A `Date`, never a string — see `DateTimeField`. */
  time_limit: Date | null;
  remarks: string;
}

export const emptyForm = (): BackDateFormState => ({
  company: "OIL",
  sap_username: "",
  document_type_name: "",
  actions: ["A"],
  from_date: null,
  to_date: null,
  time_limit: null,
  remarks: "",
});

/**
 * Both ticked is the single combined value, never two requests.
 *
 * `OPEN_BKDT` has no ACTION parameter at all, so splitting the pair would write
 * two SAP rows identical in every column SAP reads. Ordered by the list so
 * "U then A" still stores "A,U" — one spelling, not two that a diff would
 * report as a change.
 */
export const joinActions = (actions: ("A" | "U")[]): BackDateActionValue =>
  (["A", "U"] as const)
    .filter((a) => actions.includes(a))
    .join(",") as BackDateActionValue;

export const splitActions = (value: string): ("A" | "U")[] =>
  (["A", "U"] as const).filter((a) =>
    (value || "")
      .split(",")
      .map((v) => v.trim())
      .includes(a),
  );

// ---------------------------------------------------------------------------
// The order the form fills in
// ---------------------------------------------------------------------------

/**
 * A back-posting request is a chain of dependent answers, not a pile of
 * fields. The company decides which SAP users and document types exist; the
 * user and type decide whether the window is even meaningful; the window
 * decides what a sensible expiry looks like. Presenting all of it at once
 * invited people to fill the middle first and then have their earlier answers
 * cleared underneath them when they set the company last.
 *
 * So each field unlocks only once the one before it is answered. The values
 * survive going back — re-opening an earlier step re-locks what follows but
 * keeps what was typed, so correcting the company does not mean retyping
 * everything.
 *
 * `remarks` is deliberately NOT here: it is optional when raising a request,
 * and a step nobody has to complete would stall the chain behind it. It
 * unlocks once every required step is done.
 */
const STEP_ORDER = [
  "company",
  "sap_username",
  "document_type_name",
  "actions",
  "from_date",
  "to_date",
  "time_limit",
] as const;

export type BackDateStep = (typeof STEP_ORDER)[number];

/** Answered — NOT necessarily valid. Validity is `firstProblem`'s job. */
function isStepFilled(form: BackDateFormState, step: BackDateStep): boolean {
  switch (step) {
    case "company":
      return Boolean(form.company);
    case "sap_username":
      return form.sap_username.trim().length > 0;
    case "document_type_name":
      return form.document_type_name.trim().length > 0;
    case "actions":
      return form.actions.length > 0;
    case "from_date":
      return form.from_date !== null;
    case "to_date":
      return form.to_date !== null;
    case "time_limit":
      return form.time_limit !== null;
  }
}

/**
 * How far the form has got.
 *
 * `openTo` is the index of the field the user is on: everything before it is
 * answered, everything after it is locked. When every step is answered it runs
 * one past the end, which is what unlocks the optional reason.
 */
export function stepProgress(form: BackDateFormState) {
  const firstUnfilled = STEP_ORDER.findIndex(
    (step) => !isStepFilled(form, step),
  );
  const openTo = firstUnfilled === -1 ? STEP_ORDER.length : firstUnfilled;
  return { done: openTo, total: STEP_ORDER.length, openTo };
}

/**
 * The first reason this request cannot be submitted, or "" when it can.
 *
 * ONE definition, shared by the submit button's disabled state, the hint under
 * it and the check inside `submit()`. Two copies would eventually disagree,
 * and the disagreement people actually hit is a button that looks enabled and
 * then refuses — or worse, one that stays dead with nothing saying why.
 */
export function firstProblem(
  form: BackDateFormState,
  mode: "create" | "edit",
): string {
  if (!form.sap_username.trim())
    return "Pick the SAP user these rights are for.";
  if (!form.document_type_name.trim()) return "Pick a document type.";
  if (form.actions.length === 0)
    return "Pick at least one action — Add, Update, or both.";
  if (!form.from_date || !form.to_date) return "Set the posting window.";
  if (form.to_date < form.from_date)
    return "The end of the window cannot be before its start.";
  if (!form.time_limit)
    return "Set when the rights expire. SAP ignores back-posting rights that never lapse.";
  if (form.time_limit.getTime() <= Date.now())
    return "The expiry is already in the past.";
  if (toYMD(form.time_limit) < toYMD(form.from_date))
    return "The expiry cannot be before the window starts.";
  // An edit is somebody changing a request — often somebody else's. The reason
  // is the only record of why, so it is required here and optional on create.
  if (mode === "edit" && !form.remarks.trim())
    return "Give a reason for this change.";
  return "";
}

interface Props {
  form: BackDateFormState;
  setForm: (next: BackDateFormState) => void;
  /** Edit hides Company — it decides the route and the request is routed. */
  mode: "create" | "edit";
}

/**
 * The BackDate request body, shared by the create and edit screens.
 *
 * One component so a field cannot exist on one and not the other: the whole
 * reason an approver can edit is to correct a value SAP refused, and a field
 * missing here is a request that can only be fixed on the web.
 */
export default function BackDateRequestForm({ form, setForm, mode }: Props) {
  const { userOptions, typeOptions, loadingMasters, mastersError } =
    useBackDateMasters(form.company);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const { done, total, openTo } = stepProgress(form);
  /**
   * Editing never gates. Every field is already answered, so the chain would
   * be open end to end anyway — but an approver correcting a value SAP refused
   * must be able to go straight to it, not walk the form from the top.
   */
  const gated = mode === "create";
  const stepState = (index: number) => ({
    locked: gated && index > openTo,
    // Only the field immediately next in line explains itself. A lock line
    // under every remaining field is noise that stops being read.
    showHint: gated && index === openTo + 1,
  });

  const set = (patch: Partial<BackDateFormState>) =>
    setForm({ ...form, ...patch });

  const toggleAction = (action: "A" | "U") =>
    set({
      actions: form.actions.includes(action)
        ? form.actions.filter((a) => a !== action)
        : [...form.actions, action],
    });

  return (
    <>
      {gated ? <StepProgress done={done} total={total} /> : null}

      <Surface style={styles.section}>
        <SectionHeader title="REQUEST DETAILS" />

        {mode === "create" ? (
          <Step {...stepState(0)} style={styles.field}>
            <Dropdown
              label="Company"
              data={BACKDATE_COMPANIES.map((c) => ({ label: c, value: c }))}
              value={form.company}
              onChange={(value: string) =>
                // The SAP lists are per company, so the previous company's
                // picks may not exist here. Cleared rather than silently kept.
                set({
                  company: value as BackDateCompany,
                  sap_username: "",
                  document_type_name: "",
                })
              }
              placeholder="Select company"
              searchable={false}
              leftIcon="business-outline"
              iconColor={COLORS.textSecondary}
              required
            />
          </Step>
        ) : (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Company</Text>
            <View style={styles.readOnlyBox}>
              <Ionicons
                name="business-outline"
                size={18}
                color={COLORS.textSecondary}
              />
              <Text style={styles.readOnlyValue}>{form.company}</Text>
              <Text style={styles.readOnlyNote}>(cannot change)</Text>
            </View>
            <Text style={styles.fieldHint}>
              The company decides the approval route, and this request has
              already been routed by it.
            </Text>
          </View>
        )}

        {mastersError ? (
          <View style={styles.mastersBanner}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={COLORS.warning}
            />
            <Text style={styles.mastersText}>
              SAP&rsquo;s lists could not be loaded, so the SAP user and
              document type are free text. Type them exactly as SAP has them.
            </Text>
          </View>
        ) : null}

        <Step {...stepState(1)} style={styles.field}>
          {userOptions.length > 0 ? (
            <Dropdown
              label="SAP User"
              data={userOptions}
              value={form.sap_username}
              onChange={(value: string) => set({ sap_username: value })}
              placeholder={
                loadingMasters ? "Loading SAP users…" : "Select a SAP user"
              }
              leftIcon="person-outline"
              iconColor={COLORS.textSecondary}
              required
            />
          ) : (
            <FormField
              label="SAP User"
              value={form.sap_username}
              onChangeText={(text) => set({ sap_username: text })}
              placeholder={loadingMasters ? "Loading…" : "USER12"}
              // HANA declares USERID as NVARCHAR(20); a longer value would be
              // truncated on the way in, granting rights to a name nobody
              // asked for.
              maxLength={20}
              autoCapitalize="characters"
              leftIcon="person-outline"
              required
            />
          )}
        </Step>

        <Step {...stepState(2)} style={styles.field}>
          {typeOptions.length > 0 ? (
            <Dropdown
              label="Document Type"
              data={typeOptions}
              value={form.document_type_name}
              onChange={(value: string) => set({ document_type_name: value })}
              placeholder={
                loadingMasters
                  ? "Loading document types…"
                  : "Select a document type"
              }
              leftIcon="document-text-outline"
              iconColor={COLORS.textSecondary}
              required
            />
          ) : (
            <FormField
              label="Document Type"
              value={form.document_type_name}
              onChangeText={(text) => set({ document_type_name: text })}
              placeholder={loadingMasters ? "Loading…" : "A/R Invoice"}
              maxLength={120}
              leftIcon="document-text-outline"
              required
            />
          )}
        </Step>

        <Step {...stepState(3)} style={styles.field}>
          <Text style={styles.fieldLabel}>
            Action<Text style={styles.required}> *</Text>
          </Text>
          <View style={styles.checkRow}>
            <ActionCheck
              label="Add"
              checked={form.actions.includes("A")}
              onPress={() => toggleAction("A")}
            />
            <ActionCheck
              label="Update"
              checked={form.actions.includes("U")}
              onPress={() => toggleAction("U")}
            />
          </View>
        </Step>
      </Surface>

      <Surface style={styles.section}>
        <SectionHeader title="POSTING WINDOW" />

        <Step {...stepState(4)} style={styles.field}>
          <Text style={styles.fieldLabel}>
            From Date<Text style={styles.required}> *</Text>
          </Text>
          <DateBox
            value={form.from_date}
            placeholder="Select start date"
            onPress={() => setPicking("from")}
          />
        </Step>

        <Step {...stepState(5)} style={styles.field}>
          <Text style={styles.fieldLabel}>
            To Date<Text style={styles.required}> *</Text>
          </Text>
          <DateBox
            value={form.to_date}
            placeholder="Select end date"
            onPress={() => setPicking("to")}
          />
        </Step>

        <Step {...stepState(6)}>
          <DateTimeField
            label="Rights Expire"
            value={form.time_limit}
            onChange={(value) => set({ time_limit: value })}
            placeholder="Select date and time"
            // Rights that lapse before the window opens grant nothing, and an
            // expiry in the past is refused by the server.
            minimumDate={maxDate(new Date(), form.from_date)}
            required
          />
        </Step>

        {picking !== null ? (
          <DateTimePicker
            value={
              (picking === "from" ? form.from_date : form.to_date) ?? new Date()
            }
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={
              picking === "to" ? (form.from_date ?? undefined) : undefined
            }
            onChange={(event, picked) => {
              setPicking(null);
              if (event?.type === "dismissed" || !picked) return;
              if (picking === "from") {
                // Moving the start past the end would leave an impossible
                // window on screen; clearing the end asks for it again rather
                // than silently keeping a pair that cannot be submitted.
                set({
                  from_date: picked,
                  ...(form.to_date && form.to_date < picked
                    ? { to_date: null }
                    : {}),
                });
                return;
              }
              set({ to_date: picked });
            }}
          />
        ) : null}
      </Surface>

      <Surface style={styles.section}>
        <SectionHeader title="REASON" />
        <Step {...stepState(STEP_ORDER.length)}>
          <FormField
            label={mode === "edit" ? "Reason for this change" : "Reason"}
            value={form.remarks}
            onChangeText={(text) => set({ remarks: text })}
            placeholder={
              mode === "edit"
                ? "Recorded against this edit in the request's history"
                : "Month-end close — invoices received late from the depot."
            }
            multiline
            maxLength={2000}
            optional={mode === "create"}
            required={mode === "edit"}
          />
        </Step>
      </Surface>
    </>
  );
}

/**
 * One field in the chain.
 *
 * A locked field is dimmed and untouchable rather than hidden. Hiding would
 * make the form look shorter than it is and give no sense of what is still to
 * come; dimming shows the whole shape of the request while making it obvious
 * which single field is being asked for now.
 *
 * `pointerEvents="none"` is what actually stops the interaction. Disabling
 * each input individually would mean adding a prop to four different field
 * components — including one shared with Payments — and missing any of them
 * would leave a lock that looks locked and is not.
 */
function Step({
  locked,
  showHint,
  style,
  children,
}: {
  locked: boolean;
  showHint: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return (
    <View style={style}>
      <View
        pointerEvents={locked ? "none" : "auto"}
        style={locked ? styles.stepLocked : undefined}
      >
        {children}
      </View>
      {showHint ? (
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed" size={11} color={COLORS.textMuted} />
          <Text style={styles.lockText}>
            Answer the field above to unlock this one.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** How many of the required answers are in, so the chain has a visible end. */
function StepProgress({ done, total }: { done: number; total: number }) {
  const complete = done >= total;
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel}>
          {complete ? "All details filled" : `Step ${done + 1} of ${total}`}
        </Text>
        <Text style={[styles.progressCount, complete && styles.progressDone]}>
          {done}/{total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round((done / total) * 100)}%` },
            complete && styles.progressFillDone,
          ]}
        />
      </View>
    </View>
  );
}

/** The later of two dates, ignoring a missing one. */
function maxDate(a: Date, b: Date | null): Date {
  return b && b > a ? b : a;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIndicator} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ActionCheck({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.checkBox, checked && styles.checkBoxOn]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Checkbox.Android
        status={checked ? "checked" : "unchecked"}
        color={COLORS.primary}
        onPress={onPress}
      />
      <Text style={[styles.checkLabel, checked && styles.checkLabelOn]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** A date, shown the way every other date field in the app shows one. */
function DateBox({
  value,
  placeholder,
  onPress,
}: {
  value: Date | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <TextInput
        value={value ? formatDate(value) : ""}
        mode="outlined"
        placeholder={placeholder}
        editable={false}
        pointerEvents="none"
        textColor={COLORS.black}
        style={styles.input}
        outlineStyle={styles.inputOutline}
        outlineColor={COLORS.border}
        activeOutlineColor={COLORS.primary}
        left={<TextInput.Icon icon="calendar-outline" color={COLORS.primary} />}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  field: { marginBottom: SPACING.sm },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  required: { color: COLORS.error },
  fieldHint: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  input: { backgroundColor: COLORS.inputBackground, fontSize: 14 },
  inputOutline: { borderRadius: RADIUS.md, borderWidth: 1.5 },

  readOnlyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 56,
  },
  readOnlyValue: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  readOnlyNote: { fontSize: 11, color: COLORS.textMuted },

  mastersBanner: {
    flexDirection: "row",
    gap: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  mastersText: { flex: 1, fontSize: 11, lineHeight: 16, color: COLORS.warning },

  checkRow: { flexDirection: "row", gap: SPACING.sm },
  checkBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingRight: SPACING.md,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  checkBoxOn: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  checkLabel: { fontSize: 14, color: COLORS.textSecondary },
  checkLabelOn: { color: COLORS.primary, fontWeight: "600" },

  // Faded enough to read as unavailable, legible enough to still be read.
  stepLocked: { opacity: 0.4 },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  lockText: { fontSize: 11, color: COLORS.textMuted },

  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
    elevation: 2,
  },
  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  progressLabel: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  progressCount: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  progressDone: { color: COLORS.success },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.borderLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  progressFillDone: { backgroundColor: COLORS.success },
});
