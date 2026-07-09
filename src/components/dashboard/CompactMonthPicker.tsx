import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";

interface Props {
  year: number;
  month: number; // 0 = All (year to date), 1..12 = specific month
  onChangeYear: (year: number) => void;
  onChangeMonth: (month: number) => void;
}

const MONTHS_SHORT = [
  "All",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "All",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Compact single-pill month/year picker used in the dashboard header. Shows
 * "📅 July 2026 ▾" and opens a small modal with a year stepper + month grid.
 * Replaces the old two-dropdown MonthPicker, which overflowed the header row.
 */
export default function CompactMonthPicker({
  year,
  month,
  onChangeYear,
  onChangeMonth,
}: Props) {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const label = month === 0 ? `${year}` : `${MONTHS_LONG[month]} ${year}`;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={styles.pill}
      >
        <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
        <Text style={styles.pillText} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={15} color="#64748B" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.yearRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onChangeYear(year - 1)}
                style={styles.yearBtn}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.yearText}>{year}</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={year >= currentYear}
                onPress={() => onChangeYear(year + 1)}
                style={styles.yearBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={year >= currentYear ? "#CBD5E1" : COLORS.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {MONTHS_SHORT.map((m, i) => {
                const active = month === i;
                return (
                  <TouchableOpacity
                    key={m}
                    activeOpacity={0.8}
                    onPress={() => {
                      onChangeMonth(i);
                      setOpen(false);
                    }}
                    style={[styles.cell, active && styles.cellActive]}
                  >
                    <Text style={[styles.cellText, active && styles.cellTextActive]}>
                      {m}
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: 170,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  yearBtn: {
    width: 40,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  yearText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: "22%",
    flexGrow: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  cellActive: {
    backgroundColor: COLORS.primary,
  },
  cellText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  cellTextActive: {
    color: "#fff",
  },
});
