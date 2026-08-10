import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { TextInput } from "react-native-paper";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "number-pad";
  maxLength?: number;
  leftIcon?: string;
  prefix?: string;
  /** Lets a screen scroll this field clear of the keyboard when it is focused. */
  onFocus?: () => void;
  /** "characters" shows a caps keyboard — used for codes like a bank name. */
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}

/**
 * The app's standard outlined field with the small grey caption label above it —
 * same recipe as Create User / Create Order, extracted here so every field on
 * the payment cards is identical without repeating 15 props per input.
 */
export default function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  optional = false,
  multiline = false,
  keyboardType = "default",
  maxLength,
  leftIcon,
  prefix,
  onFocus,
  autoCapitalize,
}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
        {optional ? <Text style={styles.optional}> (Optional)</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        mode="outlined"
        placeholder={placeholder}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        textColor={COLORS.black}
        style={[styles.input, multiline && styles.inputMultiline]}
        outlineStyle={styles.inputOutline}
        outlineColor={COLORS.border}
        activeOutlineColor={COLORS.primary}
        left={
          prefix ? (
            <TextInput.Affix text={prefix} textStyle={styles.affix} />
          ) : leftIcon ? (
            <TextInput.Icon icon={leftIcon} color={COLORS.textSecondary} />
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  required: {
    color: COLORS.error,
  },
  optional: {
    color: COLORS.textMuted,
    fontWeight: "400",
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: SPACING.sm,
  },
  inputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  affix: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
});
