import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useRef, useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";

import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { formatInstant } from "@/src/utils/datetime";

interface DateTimeFieldProps {
  label: string;
  /**
   * A `Date`, never a formatted string.
   *
   * This is the whole point of the component. `<input type="datetime-local">`
   * and its native equivalents deal in wall clocks — "16 Sep, 2 o'clock" — with
   * no timezone attached. Send one of those to a server that reads a zoneless
   * timestamp as UTC and the value lands hours away from what the user picked.
   * Holding a `Date` means the caller can only ever serialise a real instant.
   */
  value: Date | null;
  onChange: (value: Date) => void;
  placeholder?: string;
  /** Rejects earlier picks in the native picker itself. */
  minimumDate?: Date;
  required?: boolean;
  disabled?: boolean;
}

/**
 * A date AND time in one field.
 *
 * `@react-native-community/datetimepicker` has no combined `datetime` mode on
 * Android — it is iOS-only — so Android runs the two native dialogs in
 * sequence. That sequencing is the only reason this component exists; the
 * styling is deliberately identical to the date-only fields elsewhere so the
 * form reads as one thing.
 *
 * CANCELLING KEEPS THE OLD VALUE. Dismissing either step leaves `value`
 * untouched rather than committing what was picked so far: a half-picked
 * expiry — the right day at 00:00 — is a materially different grant from the
 * one the user meant, and it would look deliberate afterwards.
 */
export default function DateTimeField({
  label,
  value,
  onChange,
  placeholder = "Select date and time",
  minimumDate,
  required = false,
  disabled = false,
}: DateTimeFieldProps) {
  const [step, setStep] = useState<"date" | "time" | null>(null);
  /** The date half, held between the two Android dialogs. */
  const draft = useRef<Date | null>(null);

  const open = () => {
    if (disabled) return;
    draft.current = null;
    setStep(Platform.OS === "ios" ? "time" : "date");
  };

  /** iOS: one combined spinner, so a single change is the whole answer. */
  const handleIos = (_event: unknown, picked?: Date) => {
    setStep(null);
    if (picked) onChange(zeroSeconds(picked));
  };

  const handleDate = (event: { type?: string }, picked?: Date) => {
    if (event?.type === "dismissed" || !picked) {
      setStep(null);
      return;
    }
    draft.current = picked;
    setStep("time");
  };

  const handleTime = (event: { type?: string }, picked?: Date) => {
    setStep(null);
    // Backing out of the time step must not commit a date at midnight.
    if (event?.type === "dismissed" || !picked || !draft.current) return;

    const day = draft.current;
    onChange(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        picked.getHours(),
        picked.getMinutes(),
        0,
        0,
      ),
    );
  };

  return (
    <View style={{ marginBottom: SPACING.sm }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <TouchableOpacity activeOpacity={0.8} onPress={open} disabled={disabled}>
        <TextInput
          value={value ? formatInstant(value) : ""}
          mode="outlined"
          placeholder={placeholder}
          editable={false}
          pointerEvents="none"
          textColor={COLORS.black}
          style={styles.input}
          outlineStyle={styles.outline}
          outlineColor={COLORS.border}
          activeOutlineColor={COLORS.primary}
          left={
            <TextInput.Icon
              icon="calendar-clock"
              color={disabled ? COLORS.textMuted : COLORS.primary}
            />
          }
        />
      </TouchableOpacity>

      {step !== null ? (
        <DateTimePicker
          // The time step continues from the date the user just chose, so the
          // spinner opens on the right day rather than on today.
          value={draft.current ?? value ?? new Date()}
          mode={Platform.OS === "ios" ? "datetime" : step}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={step === "date" ? minimumDate : undefined}
          onChange={
            Platform.OS === "ios"
              ? handleIos
              : step === "date"
                ? handleDate
                : handleTime
          }
        />
      ) : null}
    </View>
  );
}

/** Seconds and millis to zero, so a re-pick of the same minute is not a diff. */
function zeroSeconds(date: Date): Date {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  return copy;
}

const styles = {
  label: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  required: { color: COLORS.error },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  outline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
};
