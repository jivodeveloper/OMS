import React, { useRef, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

export type DateFilterMode = "date" | "month" | "year";

export type DateFilterValue = {
  mode: DateFilterMode;
  /** YYYY-MM-DD for date mode, YYYY-MM for month mode, YYYY for year mode */
  value: string;
} | null;

type InlineOrderDateFilterProps = {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  variant?: "compact" | "field";
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();

const formatDateForValue = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const formatDisplayLabel = (filter: DateFilterValue): string => {
  if (!filter) return "";
  if (filter.mode === "year") {
    return filter.value;
  }
  if (filter.mode === "month") {
    const [y, m] = filter.value.split("-");
    return `${MONTH_SHORT[parseInt(m, 10) - 1]} ${y}`;
  }
  const d = new Date(`${filter.value}T00:00:00`);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

export default function InlineOrderDateFilter({
  value,
  onChange,
  variant = "compact",
}: InlineOrderDateFilterProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const webDateRef = useRef<HTMLInputElement | null>(null);

  const now = new Date();
  const [pickerYear, setPickerYear] = useState(
    value?.mode === "month"
      ? parseInt(value.value.split("-")[0], 10)
      : now.getFullYear(),
  );

  const isActive = value !== null;
  const displayLabel = formatDisplayLabel(value);

  const datePickerValue = useMemo(() => {
    if (value?.mode === "date") return new Date(`${value.value}T00:00:00`);
    return new Date();
  }, [value]);

  const handleSelectDate = (dateStr: string) => {
    onChange({ mode: "date", value: dateStr });
  };

  const handleSelectMonth = (year: number, month: number) => {
    const val = `${year}-${String(month).padStart(2, "0")}`;
    onChange({ mode: "month", value: val });
    setShowMonthModal(false);
  };

  const handleClear = () => onChange(null);

  const handleModeSelect = (mode: DateFilterMode) => {
    setShowModeMenu(false);
    if (mode === "date") {
      if (Platform.OS === "web") {
        // Programmatically click the hidden date input
        setTimeout(() => webDateRef.current?.showPicker?.(), 100);
      } else {
        setShowDatePicker(true);
      }
    } else {
      if (value?.mode === "month") {
        setPickerYear(parseInt(value.value.split("-")[0], 10));
      } else {
        setPickerYear(now.getFullYear());
      }
      setShowMonthModal(true);
    }
  };

  // --- Month Picker Modal ---
  const monthModal = (
    <Modal
      visible={showMonthModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowMonthModal(false)}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={() => setShowMonthModal(false)}
      >
        <Pressable style={styles.monthModalContent} onPress={() => {}}>
          {/* Year selector */}
          <View style={styles.yearRow}>
            <TouchableOpacity
              onPress={() => setPickerYear((y) => Math.max(2024, y - 1))}
              style={styles.yearArrow}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.yearText}>{pickerYear}</Text>
            <TouchableOpacity
              onPress={() =>
                setPickerYear((y) => Math.min(currentYear, y + 1))
              }
              style={styles.yearArrow}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Month grid */}
          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((name, idx) => {
              const monthNum = idx + 1;
              const isSelected =
                value?.mode === "month" &&
                value.value ===
                  `${pickerYear}-${String(monthNum).padStart(2, "0")}`;
              const isFuture =
                pickerYear === currentYear && monthNum > now.getMonth() + 1;

              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.monthCell,
                    isSelected && styles.monthCellSelected,
                    isFuture && styles.monthCellDisabled,
                  ]}
                  disabled={isFuture}
                  onPress={() => handleSelectMonth(pickerYear, monthNum)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.monthCellText,
                      isSelected && styles.monthCellTextSelected,
                      isFuture && styles.monthCellTextDisabled,
                    ]}
                  >
                    {MONTH_SHORT[idx]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.monthCancelBtn}
            onPress={() => setShowMonthModal(false)}
          >
            <Text style={styles.monthCancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // --- Mode Menu ---
  const modeMenu = (
    <Modal
      visible={showModeMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowModeMenu(false)}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={() => setShowModeMenu(false)}
      >
        <Pressable style={styles.modeMenuContent} onPress={() => {}}>
          <Text style={styles.modeMenuTitle}>Filter by</Text>

          <TouchableOpacity
            style={styles.modeOption}
            onPress={() => handleModeSelect("date")}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={COLORS.primary}
            />
            <Text style={styles.modeOptionText}>Specific Date</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeOption}
            onPress={() => handleModeSelect("month")}
          >
            <Ionicons name="calendar" size={20} color={COLORS.primary} />
            <Text style={styles.modeOptionText}>Full Month</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // --- Main button ---
  const mainButton = (
    <TouchableOpacity
      style={[styles.filterButton, isActive && styles.filterButtonActive]}
      onPress={() => setShowModeMenu(true)}
      activeOpacity={0.8}
    >
      <Ionicons
        name="calendar-outline"
        size={16}
        color={isActive ? COLORS.primary : COLORS.textSecondary}
      />
      {isActive ? (
        <Text style={styles.filterLabel}>{displayLabel}</Text>
      ) : null}
      {isActive ? (
        <Pressable onPress={handleClear} style={styles.clearBadge}>
          <Ionicons name="close" size={9} color="#fff" />
        </Pressable>
      ) : null}
    </TouchableOpacity>
  );

  // --- WEB ---
  if (Platform.OS === "web") {
    return (
      <View style={styles.row}>
        {mainButton}
        {modeMenu}
        {monthModal}
        {/* Hidden date input for web */}
        <View style={styles.hiddenWebInput}>
          {/* @ts-ignore valid on web */}
          <input
            ref={webDateRef as any}
            type="date"
            onChange={(event: any) => {
              if (event.target.value) handleSelectDate(event.target.value);
            }}
            style={{
              position: "absolute",
              opacity: 0,
              width: 1,
              height: 1,
              pointerEvents: "none",
            } as any}
          />
        </View>
      </View>
    );
  }

  // --- NATIVE ---
  return (
    <View style={styles.row}>
      {mainButton}
      {modeMenu}
      {monthModal}
      {showDatePicker ? (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (!selectedDate) return;
            handleSelectDate(formatDateForValue(selectedDate));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 28,
    gap: 4,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
  clearBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  modeMenuContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: 260,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modeMenuTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 14,
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  modeOptionText: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.text,
  },
  monthModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: 300,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 16,
  },
  yearArrow: {
    padding: 4,
  },
  yearText: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    minWidth: 60,
    textAlign: "center",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthCell: {
    width: "30%",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthCellSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  monthCellDisabled: {
    opacity: 0.35,
  },
  monthCellText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  monthCellTextSelected: {
    color: "#fff",
  },
  monthCellTextDisabled: {
    color: COLORS.textMuted,
  },
  monthCancelBtn: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 10,
  },
  monthCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  hiddenWebInput: {
    width: 0,
    height: 0,
    overflow: "hidden",
  },
});
