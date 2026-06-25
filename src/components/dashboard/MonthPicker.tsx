import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Dropdown } from 'react-native-element-dropdown';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';

interface MonthPickerProps {
  year: number;
  month: number;
  onChangeYear: (year: number) => void;
  onChangeMonth: (month: number) => void;
}

const MONTHS = [
  { label: 'All (Year to Date)', value: 0 },
  { label: 'January', value: 1 },
  { label: 'February', value: 2 },
  { label: 'March', value: 3 },
  { label: 'April', value: 4 },
  { label: 'May', value: 5 },
  { label: 'June', value: 6 },
  { label: 'July', value: 7 },
  { label: 'August', value: 8 },
  { label: 'September', value: 9 },
  { label: 'October', value: 10 },
  { label: 'November', value: 11 },
  { label: 'December', value: 12 },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2023 }, (_, i) => ({
  label: String(2024 + i),
  value: 2024 + i,
}));

export default function MonthPicker({ year, month, onChangeYear, onChangeMonth }: MonthPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.pickerRow}>
        <View style={styles.pickerItem}>
          <Text style={styles.label}>Month</Text>
          <Dropdown
            data={MONTHS}
            labelField="label"
            valueField="value"
            value={month}
            onChange={(item) => onChangeMonth(item.value)}
            style={styles.dropdown}
            selectedTextStyle={styles.selectedText}
            placeholderStyle={styles.placeholderText}
            placeholder="Month"
          />
        </View>
        <View style={styles.pickerItem}>
          <Text style={styles.label}>Year</Text>
          <Dropdown
            data={YEARS}
            labelField="label"
            valueField="value"
            value={year}
            onChange={(item) => onChangeYear(item.value)}
            style={styles.dropdown}
            selectedTextStyle={styles.selectedText}
            placeholderStyle={styles.placeholderText}
            placeholder="Year"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  pickerItem: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  placeholderText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
