import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "@/src/constants/theme";

interface RemarksInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  /** Turns the outline red — used when a required remark is missing. */
  error?: boolean;
}

const DEFAULT_MAX_LENGTH = 500;

/** Labelled textarea with a live character counter. */
export default function RemarksInput({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength = DEFAULT_MAX_LENGTH,
  error = false,
}: RemarksInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        multiline
        numberOfLines={4}
        maxLength={maxLength}
        textAlignVertical="top"
      />

      <Text style={styles.counter}>
        {value.length} / {maxLength}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
    marginTop: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    minHeight: 92,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  counter: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "right",
    marginTop: 6,
  },
});
