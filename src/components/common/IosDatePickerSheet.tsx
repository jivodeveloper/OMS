import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";

interface IosDatePickerSheetProps {
  visible: boolean;
  title: string;
  mode: "date" | "datetime";
  /** Where the calendar opens; today when nothing is picked yet. */
  value: Date | null;
  minimumDate?: Date;
  onCancel: () => void;
  onConfirm: (value: Date) => void;
}

/**
 * iOS only: the native calendar in a bottom sheet, committed with Done.
 *
 * The inline spinner it replaces fired `onChange` on every wheel tick, so the
 * first scroll closed it with a half-chosen date. Here the calendar holds a
 * draft, and nothing reaches the form until Done; Cancel or a tap outside
 * keeps the previous value.
 */
export default function IosDatePickerSheet({
  visible,
  title,
  mode,
  value,
  minimumDate,
  onCancel,
  onConfirm,
}: IosDatePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  // Each opening starts from the field's current value, not the last draft.
  // Keyed on `visible` alone: callers build `minimumDate` fresh each render,
  // and re-running on that would snap the calendar back mid-pick.
  useEffect(() => {
    if (!visible) return;
    const start = value ?? new Date();
    setDraft(minimumDate && start < minimumDate ? minimumDate : start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={() => onConfirm(draft)} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        <DateTimePicker
          value={draft}
          mode={mode}
          display="inline"
          themeVariant="light"
          accentColor={COLORS.primary}
          minimumDate={minimumDate}
          onChange={(_event, picked) => {
            if (picked) setDraft(picked);
          }}
          style={styles.picker}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  cancel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  done: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
  },
  picker: {
    alignSelf: "center",
  },
});
