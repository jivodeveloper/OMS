import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import { money } from "./format";

/**
 * One KPI tile.
 *
 * A phone has no hover, so the web's tooltip becomes an explicit info button
 * plus a long-press on the card — a discoverable control and a shortcut for
 * anyone who already knows the gesture. The explanation opens in a small modal
 * rather than a transient toast, because these definitions are the sort of
 * thing a reader wants to sit and read ("does this include drafts?").
 */

const TONES: Record<string, { bg: string; fg: string }> = {
  indigo: { bg: "#EEF2FF", fg: "#4F46E5" },
  green: { bg: "#ECFDF5", fg: "#047857" },
  amber: { bg: "#FFF7ED", fg: "#C2410C" },
  violet: { bg: "#F5F3FF", fg: "#7C3AED" },
  sky: { bg: "#ECFEFF", fg: "#0E7490" },
  slate: { bg: "#F1F5F9", fg: "#475569" },
  red: { bg: "#FEF2F2", fg: "#B91C1C" },
};

/** Tones whose VALUE is coloured too, not just the icon. Reserved for the
 *  blocked figure — the one card that means "somebody must act". */
const ALERT_TONES = new Set(["red"]);

export default function KpiCard({
  label,
  value,
  hint,
  info,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  hint: string;
  info: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: keyof typeof TONES;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const palette = TONES[tone] ?? TONES.indigo;

  if (loading) {
    return (
      <View style={[s.card, s.cardLoading]}>
        <View style={s.skelIcon} />
        <View style={s.skelLineShort} />
        <View style={s.skelLineWide} />
      </View>
    );
  }

  return (
    <>
      <Pressable
        style={s.card}
        onLongPress={() => setOpen(true)}
        delayLongPress={280}
        accessibilityLabel={`${label}. ${money(value)}. ${hint}. Long press for details.`}
      >
        <View style={s.top}>
          <View style={[s.icon, { backgroundColor: palette.bg }]}>
            <Ionicons name={icon} size={ms(17)} color={palette.fg} />
          </View>
          <Pressable
            onPress={() => setOpen(true)}
            hitSlop={10}
            accessibilityLabel={`What ${label} means`}
          >
            <Ionicons
              name="information-circle-outline"
              size={ms(16)}
              color="#B6C2D2"
            />
          </Pressable>
        </View>

        <Text style={s.label} numberOfLines={1}>
          {label}
        </Text>
        {/* adjustsFontSizeToFit so a crore-scale figure still fits a half-width
            tile on a small phone rather than being clipped. */}
        <Text
          style={[s.value, ALERT_TONES.has(tone) && { color: palette.fg }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {money(value)}
        </Text>
        <Text style={s.hint} numberOfLines={1}>
          {hint}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHead}>
              <View style={[s.icon, { backgroundColor: palette.bg }]}>
                <Ionicons name={icon} size={ms(17)} color={palette.fg} />
              </View>
              <View style={s.sheetHeadText}>
                <Text style={s.sheetTitle}>{label}</Text>
                <Text style={s.sheetValue}>{money(value)}</Text>
              </View>
            </View>
            <Text style={s.sheetBody}>{info}</Text>
            <Pressable style={s.sheetBtn} onPress={() => setOpen(false)}>
              <Text style={s.sheetBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    // Two per row on a phone, wrapping to more on a tablet — the parent uses
    // flexWrap, so this basis decides the count without a media query.
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: COLORS.surface,
    borderRadius: sp(14),
    padding: sp(12),
    borderWidth: 1,
    borderColor: "#EEF2F7",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardLoading: { minHeight: ms(96), justifyContent: "space-between" },

  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  icon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(9),
    alignItems: "center",
    justifyContent: "center",
  },

  label: {
    fontSize: fs(11),
    fontWeight: "700",
    color: "#64748B",
    marginTop: sp(9),
  },
  value: {
    fontSize: fs(16),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: sp(2),
  },
  hint: { fontSize: fs(10), color: "#94A3B8", marginTop: sp(2) },

  skelIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(9),
    backgroundColor: "#EEF1F6",
  },
  skelLineShort: {
    width: "55%",
    height: ms(9),
    borderRadius: 4,
    backgroundColor: "#EEF1F6",
  },
  skelLineWide: {
    width: "80%",
    height: ms(15),
    borderRadius: 4,
    backgroundColor: "#EEF1F6",
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: sp(24),
  },
  sheet: {
    width: "100%",
    maxWidth: ms(400),
    backgroundColor: COLORS.surface,
    borderRadius: sp(18),
    padding: sp(18),
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: sp(11) },
  sheetHeadText: { flex: 1 },
  sheetTitle: { fontSize: fs(13), fontWeight: "700", color: "#64748B" },
  sheetValue: {
    fontSize: fs(19),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: sp(1),
  },
  sheetBody: {
    fontSize: fs(12.5),
    lineHeight: fs(19),
    color: "#475569",
    marginTop: sp(14),
  },
  sheetBtn: {
    marginTop: sp(18),
    backgroundColor: COLORS.primary,
    borderRadius: sp(11),
    paddingVertical: sp(12),
    alignItems: "center",
  },
  sheetBtnText: { color: "#FFFFFF", fontSize: fs(13.5), fontWeight: "800" },
});
