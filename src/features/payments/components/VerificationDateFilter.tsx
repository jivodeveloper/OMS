import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  labelFor,
  MONTH_ABBR,
  toApiDate,
  type VerificationRange,
} from "../verificationWindow";

interface Props {
  value: VerificationRange;
  onChange: (next: VerificationRange) => void;
}

/**
 * The queue's period picker: presets, plus a calendar or month grid for the
 * two that need a value.
 *
 * ONE tap to a preset, TWO to a specific date or month — the calendar opens
 * straight from the choice. An earlier version wrapped `InlineOrderDateFilter`
 * to avoid a second date UI, but that component carries its own trigger and
 * its own date/month mode menu, so choosing "Specific date" meant three
 * dialogs stacked on each other. Driving `DateTimePicker` and the month grid
 * directly is a little more code here and a much shorter path for the user.
 */
const PRESETS: {
  kind: VerificationRange["kind"];
  label: string;
  hint: string;
}[] = [
  { kind: "default", label: "Last 2 days", hint: "Today and yesterday" },
  { kind: "last7", label: "Last 7 days", hint: "Today and the 6 before" },
  { kind: "month", label: "Specific month", hint: "Pick a month" },
  { kind: "date", label: "Specific date", hint: "Pick one day" },
  { kind: "all", label: "All time", hint: "No date limit" },
];

export default function VerificationDateFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showMonths, setShowMonths] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const [pickerYear, setPickerYear] = useState(
    value.kind === "month" && value.value
      ? parseInt(value.value.split("-")[0], 10)
      : currentYear,
  );

  const choose = (kind: VerificationRange["kind"]) => {
    setOpen(false);
    // Straight into the picker — no intermediate "how do you want to filter?"
    // step, because the preset already said.
    if (kind === "date") {
      setShowCalendar(true);
      return;
    }
    if (kind === "month") {
      setShowMonths(true);
      return;
    }
    onChange({ kind });
  };

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Period: ${labelFor(value)}`}
      >
        <Ionicons name="calendar-outline" size={ms(14)} color="#fff" />
        <Text style={styles.triggerText} numberOfLines={1}>
          {labelFor(value)}
        </Text>
        <Ionicons name="chevron-down" size={ms(13)} color="#fff" />
      </Pressable>

      {/* Presets */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Show payments from</Text>
            {PRESETS.map((preset) => {
              const active = preset.kind === value.kind;
              return (
                <Pressable
                  key={preset.kind}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => choose(preset.kind)}
                  accessibilityRole="button"
                >
                  <View style={styles.optionText}>
                    <Text
                      style={[
                        styles.optionLabel,
                        active && styles.optionLabelActive,
                      ]}
                    >
                      {preset.label}
                    </Text>
                    <Text style={styles.optionHint}>{preset.hint}</Text>
                  </View>
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={ms(18)}
                      color={COLORS.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* The OS calendar, opened directly by "Specific date". */}
      {showCalendar && (
        <DateTimePicker
          value={
            value.kind === "date" && value.value
              ? new Date(`${value.value}T00:00:00`)
              : new Date()
          }
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={new Date()}
          onChange={(event, picked) => {
            // Android fires "dismissed" on cancel; iOS keeps the sheet until
            // a value lands. Either way the picker closes here.
            setShowCalendar(false);
            if (event.type === "dismissed" || !picked) return;
            onChange({ kind: "date", value: toApiDate(picked) });
          }}
        />
      )}

      {/* Month grid, opened directly by "Specific month". Mirrors the one in
          InlineOrderDateFilter so the two feel the same. */}
      <Modal
        visible={showMonths}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonths(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowMonths(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Pick a month</Text>

            <View style={styles.yearRow}>
              <TouchableOpacity
                onPress={() => setPickerYear((y) => Math.max(2024, y - 1))}
                style={styles.yearArrow}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.yearText}>{pickerYear}</Text>
              <TouchableOpacity
                onPress={() => setPickerYear((y) => Math.min(currentYear, y + 1))}
                style={styles.yearArrow}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.monthGrid}>
              {MONTH_ABBR.map((name, idx) => {
                const monthNum = idx + 1;
                const key = `${pickerYear}-${String(monthNum).padStart(2, "0")}`;
                const selected = value.kind === "month" && value.value === key;
                // A future month can hold nothing, so offering it would only
                // ever return an empty queue.
                const future =
                  pickerYear === currentYear && monthNum > now.getMonth() + 1;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[
                      styles.monthCell,
                      selected && styles.monthCellSelected,
                      future && styles.monthCellDisabled,
                    ]}
                    disabled={future}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowMonths(false);
                      onChange({ kind: "month", value: key });
                    }}
                  >
                    <Text
                      style={[
                        styles.monthCellText,
                        selected && styles.monthCellTextSelected,
                        future && styles.monthCellTextDisabled,
                      ]}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Sits on the dark gradient count bar, so it is a translucent pill in the
  // same idiom as InlineOrderDateFilter's "onDark" variant rather than a white
  // box punched into the gradient.
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(5),
    paddingHorizontal: sp(10),
    paddingVertical: sp(7),
    borderRadius: ms(20),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  // NOT `flex: 1` — the count bar gives this wrapper no width to divide, so a
  // flexed label collapsed to nothing and left a lone calendar icon.
  triggerText: { fontSize: fs(11), fontWeight: "800", color: "#fff" },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: sp(28),
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: ms(14),
    paddingVertical: sp(10),
    paddingHorizontal: sp(6),
    // Caps the sheet on a tall phone and lets it scroll on a short one, so
    // "All time" stays reachable rather than sitting below the fold.
    maxHeight: "80%",
    // Keeps the month grid readable on a tablet, where a full-width sheet
    // would stretch twelve cells across the screen.
    maxWidth: ms(420),
    alignSelf: "center",
    width: "100%",
  },
  sheetTitle: {
    fontSize: fs(11),
    fontWeight: "800",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    paddingHorizontal: sp(12),
    paddingVertical: sp(8),
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingHorizontal: sp(12),
    paddingVertical: sp(11),
    borderRadius: ms(10),
  },
  optionActive: { backgroundColor: COLORS.primaryLight ?? "#EEF2FF" },
  optionText: { flex: 1 },
  optionLabel: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  optionLabelActive: { color: COLORS.primary },
  optionHint: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: sp(1) },

  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(18),
    paddingVertical: sp(6),
  },
  yearArrow: { padding: sp(6) },
  yearText: { fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: sp(8),
    paddingBottom: sp(10),
  },
  monthCell: {
    width: "33.33%",
    paddingVertical: sp(12),
    alignItems: "center",
    borderRadius: ms(8),
  },
  monthCellSelected: { backgroundColor: COLORS.primary },
  monthCellDisabled: { opacity: 0.35 },
  monthCellText: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  monthCellTextSelected: { color: "#fff" },
  monthCellTextDisabled: { color: COLORS.textSecondary },
});
