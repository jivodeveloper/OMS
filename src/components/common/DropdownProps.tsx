import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import type { FlatListProps } from 'react-native';
import { Dropdown as RNDropdown } from 'react-native-element-dropdown';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';

interface DropdownProps {
  label: string;
  data: { label: string; value: string | number }[];
  value: string | number | null;
  onChange: (value: any) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  icon?: string;
  leftIcon?: string | null;
  iconColor?: string;
  mode?: "default" | "modal" | "auto";
  dropdownPosition?: "auto" | "top" | "bottom";
  onFocus?: () => void;
  onBlur?: () => void;
  inverted?: boolean;
  autoScroll?: boolean;
  flatListProps?: Omit<FlatListProps<any>, 'renderItem' | 'data'>;
  floatingLabel?: boolean;
  noBottomSpacing?: boolean;
}

export default function Dropdown({
  label,
  data,
  value,
  onChange,
  placeholder = 'Select...',
  error,
  required = false,
  disabled = false,
  searchable = true,
  icon = 'chevron-down',
  leftIcon = null,
  iconColor = COLORS.primary,
  mode = 'default',
  dropdownPosition = 'auto',
  onFocus,
  onBlur,
  inverted = false,
  autoScroll = false,
  flatListProps,
  floatingLabel = false,
  noBottomSpacing = false,
}: DropdownProps) {
  const normalizedData = Array.isArray(data) ? data : [];
  const showLabel = String(label || '').trim().length > 0;

  return (
    <View style={[
      styles.container,
      floatingLabel && styles.floatingContainer,
      noBottomSpacing && styles.noBottomSpacing,
    ]}>
      {showLabel ? (
        <Text style={[styles.label, floatingLabel && styles.floatingLabel]}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
      ) : null}
      
      <RNDropdown
        style={[
          styles.dropdown,
          error ? styles.dropdownError : null,
          disabled ? styles.dropdownDisabled : null,
        ]}
        placeholderStyle={styles.placeholder}
        selectedTextStyle={styles.selectedText}
        inputSearchStyle={styles.inputSearch}
        iconStyle={styles.iconStyle}
        containerStyle={styles.dropdownPopup}
        itemContainerStyle={styles.dropdownItem}
        itemTextStyle={styles.dropdownItemText}
        activeColor={COLORS.primaryLighter}
        data={normalizedData}
        search={searchable}
        maxHeight={300}
        labelField="label"
        valueField="value"
        placeholder={placeholder}
        searchPlaceholder="Search..."
        value={value}
        onChange={(item) => onChange(item.value)}
        disable={disabled}
        mode={mode}
        dropdownPosition={dropdownPosition}
        onFocus={onFocus}
        onBlur={onBlur}
        inverted={inverted}
        autoScroll={autoScroll}
        flatListProps={{
          nestedScrollEnabled: true,
          keyboardShouldPersistTaps: 'handled',
          ...flatListProps,
        }}
        renderLeftIcon={
          leftIcon
            ? () => (
              <Ionicons
                name={leftIcon as any}
                size={20}
                color={iconColor}
                style={styles.leftIcon}
              />
            )
            : undefined
        }
        renderRightIcon={() => (
          <Ionicons
            name={icon as any}
            size={20}
            color={iconColor}
          />
        )}
      />
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  noBottomSpacing: {
    marginBottom: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  floatingContainer: {
    paddingTop: 8,
  },
  floatingLabel: {
    position: 'absolute',
    top: 0,
    left: 12,
    zIndex: 2,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  required: {
    color: COLORS.error,
  },
  dropdown: {
    height: 56,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  dropdownError: {
    borderColor: COLORS.error,
  },
  dropdownDisabled: {
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },
  placeholder: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  selectedText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  inputSearch: {
    height: 44,
    fontSize: 14,
    borderRadius: RADIUS.sm,
    borderColor: COLORS.borderBlue,
    color: COLORS.text,
  },
  dropdownPopup: {
    backgroundColor: '#F8FBFF',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingVertical: SPACING.xs,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
  },
  dropdownItem: {
    borderRadius: RADIUS.md,
    marginHorizontal: SPACING.xs,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  iconStyle: {
    width: 20,
    height: 20,
  },
  leftIcon: {
    marginRight: SPACING.sm,
  },
  error: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
});
