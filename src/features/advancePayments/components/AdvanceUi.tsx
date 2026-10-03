import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";

import Dropdown from "@/src/components/common/DropdownProps";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { sp } from "@/src/utils/responsive";
import { toYMD } from "@/src/utils/datetime";

import { formatDate } from "../logic/rules";

/**
 * The small pieces every Advance Payment screen is built from.
 *
 * SAME FURNITURE AS RECEIVE PAYMENT, deliberately: the outlined Paper field
 * with a small grey caption above it, the app's dropdown, the dashed upload
 * zone. A person who has filled in a receipt has already learnt this form. The
 * RULES are the shared ones in `logic/`; only the furniture is local.
 */

/* ── Tones ───────────────────────────────────────────────────────────────── */

/**
 * The five tones the shared logic names (`STATUS_TONE`, `PRIORITY_TONE`).
 *
 * Used by `Notice` alone now. The list, the card and the details page take
 * their status pills from the payment screens' own tone tables, so this is not
 * the module's palette and is deliberately not exported.
 */
export type Tone = "ok" | "hold" | "bad" | "info" | "neutral";

const TONE_COLOR: Record<Tone, string> = {
  ok: COLORS.success,
  hold: COLORS.warning,
  bad: COLORS.error,
  info: COLORS.primary,
  neutral: COLORS.textSecondary,
};

const TONE_BACKGROUND: Record<Tone, string> = {
  ok: COLORS.successLight,
  hold: COLORS.warningLight,
  bad: COLORS.errorLight,
  info: COLORS.primaryLighter,
  neutral: COLORS.background,
};

/* ── Layout ──────────────────────────────────────────────────────────────── */

export function Card({
  title,
  subtitle,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/**
 * A card that opens and closes.
 *
 * The same construction the receive-payment method cards use: an icon, a title,
 * whatever the header wants to say on the right, and a chevron. CLOSED BY
 * DEFAULT where the caller says so — a detail page carrying four open boxes is
 * a page nobody reaches the bottom of.
 *
 * `lockedOpen` keeps it open regardless: a box with an error in it must not be
 * foldable, or the thing the user has to fix disappears behind a chevron.
 */
export function Section({
  icon,
  title,
  right,
  defaultOpen = false,
  lockedOpen = false,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Shown before the chevron — a count, a total, a warning. */
  right?: React.ReactNode;
  defaultOpen?: boolean;
  lockedOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = open || lockedOpen;

  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity
        style={styles.sectionHead}
        onPress={() => !lockedOpen && setOpen((current) => !current)}
        activeOpacity={lockedOpen ? 1 : 0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: shown }}
      >
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
        {!lockedOpen ? (
          <Ionicons
            name={shown ? "chevron-up" : "chevron-down"}
            size={18}
            color={COLORS.textSecondary}
          />
        ) : null}
      </TouchableOpacity>

      {shown ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/**
 * Two fields side by side.
 *
 * Each child takes an equal share and may shrink, so a long option (MART ·
 * Employee Imprest) wraps inside its own field rather than pushing the other
 * one off the row.
 */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      {React.Children.map(children, (child, index) =>
        child ? (
          <View key={index} style={styles.rowCell}>
            {child}
          </View>
        ) : null,
      )}
    </View>
  );
}

/**
 * A labelled control, with its validation message underneath when it has one.
 *
 * NO HINT LINE. A grey sentence under every field turned this form into small
 * print; the label says what the field is and the error says what is wrong with
 * it, which is all a requester needs while filling it in.
 */
export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={13} color={COLORS.error} />
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */

/** The app's outlined field — the one Receive Payment uses — with an error state. */
export function Input({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  editable = true,
  autoCapitalize,
  invalid,
  prefix,
  code,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences" | "characters";
  invalid?: boolean;
  /** "₹" on a money field, as the payment cards show it. */
  prefix?: string;
  /**
   * A CODE, not prose: letter-spaced, bold and in the brand colour.
   *
   * An IFSC or a SAP identifier is checked against another screen one
   * character at a time, and a code set in body text invites a misread.
   */
  code?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      mode="outlined"
      dense
      placeholder={placeholder}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      // Otherwise the placeholder and the first line sit centred in a tall box.
      textAlignVertical={multiline ? "top" : "center"}
      keyboardType={keyboardType ?? "default"}
      editable={editable}
      autoCapitalize={autoCapitalize}
      error={invalid}
      textColor={editable ? COLORS.black : COLORS.textSecondary}
      style={[styles.input, multiline && styles.inputMultiline, code && styles.inputCode]}
      outlineStyle={styles.inputOutline}
      outlineColor={COLORS.border}
      activeOutlineColor={COLORS.primary}
      left={prefix ? <TextInput.Affix text={prefix} textStyle={styles.affix} /> : undefined}
    />
  );
}

/**
 * One choice from a list, in a dropdown — Company, Type, Payment Against,
 * Priority, Department.
 *
 * `search` is left off for short lists: a five-option dropdown with a search
 * box in it is more to read, not less.
 */
export function Select({
  label,
  required,
  error,
  data,
  value,
  onChange,
  placeholder,
  searchable = false,
  disabled,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  data: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Dropdown
        label={label}
        required={required}
        data={data}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? `Select ${label}`}
        searchable={searchable}
        disabled={disabled}
        // The dropdown draws its own red outline and message from this, so the
        // error is NOT repeated underneath.
        error={error ?? undefined}
        // In a two-column row the list must not be clipped by the row itself.
        mode="modal"
        noBottomSpacing
      />
    </View>
  );
}

/**
 * A date held as `YYYY-MM-DD`, which is what the request's fields are.
 *
 * The picked `Date` is read through `toYMD`, on the LOCAL calendar — never
 * `toISOString()`, which sends yesterday for anyone picking before 05:30 IST.
 */
export function DateField({
  value,
  onChange,
  placeholder = "Select date",
  editable = true,
  invalid,
  minDate,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  editable?: boolean;
  invalid?: boolean;
  /**
   * The earliest date this field accepts, as `YYYY-MM-DD` — the native picker
   * greys out everything before it.
   *
   * The SAME bound the web form puts on its date inputs (`min={today}`,
   * `min={expectedFromDate}`). Offering a date the shared `validate()` will
   * reject is how a requester fills the form twice.
   */
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? new Date(`${value}T00:00:00`) : new Date();

  return (
    <>
      <TouchableOpacity
        style={[
          styles.dateBox,
          invalid && styles.dateBoxInvalid,
          !editable && styles.dateBoxDisabled,
        ]}
        onPress={() => editable && setOpen(true)}
        activeOpacity={editable ? 0.7 : 1}
      >
        <Text style={value ? styles.dateText : styles.datePlaceholder} numberOfLines={1}>
          {value ? formatDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={Number.isNaN(current.getTime()) ? new Date() : current}
          mode="date"
          minimumDate={minDate ? new Date(`${minDate}T00:00:00`) : undefined}
          onChange={(event, picked) => {
            setOpen(false);
            // Dismissing keeps the old value: a half-made pick must not look
            // like a deliberate one.
            if (event.type === "set" && picked) onChange(toYMD(picked));
          }}
        />
      )}
    </>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: TONE_BACKGROUND[tone], borderColor: TONE_COLOR[tone] },
      ]}
    >
      <Ionicons
        name={tone === "bad" ? "alert-circle-outline" : "information-circle-outline"}
        size={16}
        color={TONE_COLOR[tone]}
      />
      <View style={styles.noticeBody}>{children}</View>
    </View>
  );
}

export function NoticeText({ tone, text }: { tone: Tone; text: string }) {
  return <Text style={[styles.noticeText, { color: TONE_COLOR[tone] }]}>{text}</Text>;
}

const styles = StyleSheet.create({

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  /**
   * A Section is a card of the DETAIL PAGE, and carries that page's gutter and
   * geometry — radius, padding, border, shadow and the 14pt side margin — so a
   * Pay To box is exactly as wide as the General Information box above it.
   * `Card` above has no gutter because the form puts it inside a padded scroll.
   */
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginHorizontal: sp(14),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  // The receive-payment method card's header, to the pixel.
  sectionHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.text },
  // Room under the header, and between everything inside it.
  sectionBody: { marginTop: SPACING.xs },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.sm,
    lineHeight: 17,
  },

  // `flex-start`, not the default stretch: a validation message under one field must not
  // stretch the other's box to match it.
  row: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  rowCell: { flex: 1, minWidth: 0 },

  field: { marginTop: SPACING.md },
  // EXACTLY the shared dropdown's label metrics (`DropdownProps.styles.label`):
  // a date beside a dropdown only lines up if both captions take the same room.
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  required: { color: COLORS.error },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  fieldError: { flex: 1, fontSize: 11, color: COLORS.error, fontWeight: "600" },


  // The same 56 as the dropdown and the date box: a money field beside a date
  // field must not sit two pixels higher than it.
  input: { backgroundColor: COLORS.surface, fontSize: 14, height: 56 },
  inputMultiline: { height: undefined, minHeight: 90, paddingTop: SPACING.sm },
  inputCode: { fontWeight: "800", letterSpacing: 1.2, color: COLORS.primaryDark },
  inputOutline: { borderRadius: RADIUS.md, borderWidth: 1.5 },
  affix: { color: COLORS.textSecondary, fontSize: 14 },

  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.xs,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    // The dropdown's height, to the pixel — Payment Date sits beside Priority.
    height: 56,
  },
  dateBoxInvalid: { borderColor: COLORS.error },
  dateBoxDisabled: { backgroundColor: COLORS.inputBackground },
  dateText: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: "600" },
  datePlaceholder: { flex: 1, fontSize: 14, color: COLORS.textMuted },


  notice: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginTop: SPACING.md,
  },
  noticeBody: { flex: 1, gap: 2 },
  noticeText: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
});
