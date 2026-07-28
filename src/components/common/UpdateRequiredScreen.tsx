import React, { useCallback } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/src/constants/theme';
import { deviceService } from '@/src/services/device.service';
import { useUpdate } from '@/src/context/UpdateContext';

/**
 * UpdateRequiredScreen — the full-screen block shown when the backend forces an
 * update (HTTP 426). Rendered as an overlay ABOVE the whole navigator by the
 * root layout, so:
 *   • there is no route to it and no route away from it — navigation is blocked;
 *   • there is no Back / Skip / Dismiss control;
 *   • the Android hardware back button is swallowed while it is shown.
 *
 * The only action is "Update Now", which opens the store URL. Nothing here
 * touches auth, tokens or storage — the block is purely a UI gate.
 */
export default function UpdateRequiredScreen() {
  const insets = useSafeAreaInsets();
  const { message, requiredVersion, requiredBuild, storeUrl } = useUpdate();

  // Current build the app is actually running, from native metadata.
  const currentVersion = deviceService.getAppVersion();
  const currentBuild = deviceService.getBuildNumber();

  // Status pills are computed, not hardcoded: the current build is "Outdated"
  // only when it is genuinely below the required build. In a real force update
  // it always is — so this looks like the mockup — but it can never contradict
  // the numbers shown beside it.
  const isOutdated =
    requiredBuild != null && Number.isFinite(currentBuild) && currentBuild < requiredBuild;

  // Swallow the Android hardware back button: there is nowhere to go back to,
  // and the update must not be dismissable. Returning true = "handled".
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  const onUpdate = useCallback(async () => {
    if (!storeUrl) return;
    try {
      await Linking.openURL(storeUrl);
    } catch {
      // Store app missing / URL unopenable — leave the block up; the user can
      // retry. We deliberately do NOT unblock on failure.
    }
  }, [storeUrl]);

  return (
    <LinearGradient
      colors={['#EAF1FB', '#F4F8FD', '#FFFFFF']}
      style={styles.root}
    >
      <View style={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        {/* Rocket, top-right, drawn with an icon (no extra asset needed). */}
        <View style={styles.rocketWrap} pointerEvents="none">
          <Ionicons name="sparkles" size={16} color="#C7DBF5" style={styles.sparkleA} />
          <Ionicons name="sparkles" size={11} color="#D7E6F8" style={styles.sparkleB} />
          <Ionicons name="rocket" size={72} color="#6EA8F0" style={styles.rocket} />
        </View>

        {/* Logo badge, overlapping the top of the card. */}
        <View style={styles.badge}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.badgeLogo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.rows}>
            <Row
              icon="information-circle-outline"
              label="Current Version"
              value={currentVersion || '—'}
              pill={isOutdated ? 'outdated' : undefined}
            />
            <Row
              icon="arrow-up-circle-outline"
              label="Required Version"
              value={requiredVersion || '—'}
              valueColor={COLORS.primary}
              pill="latest"
            />
            <Row
              icon="layers-outline"
              label="Current Build"
              value={String(currentBuild)}
              pill={isOutdated ? 'outdated' : undefined}
            />
            <Row
              icon="arrow-up-circle-outline"
              label="Required Build"
              value={requiredBuild != null ? String(requiredBuild) : '—'}
              valueColor={COLORS.primary}
              pill="latest"
              last
            />
          </View>

          {/* Reassurance note. */}
          <View style={styles.note}>
            <View style={styles.noteIcon}>
              <Ionicons name="information" size={13} color={COLORS.primary} />
            </View>
            <Text style={styles.noteText}>
              Newer versions include bug fixes, performance improvements and new features.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, !storeUrl && styles.buttonDisabled]}
            onPress={onUpdate}
            disabled={!storeUrl}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Update Now"
          >
            <Ionicons name="download-outline" size={20} color={COLORS.textLight} />
            <Text style={styles.buttonText}>Update Now</Text>
          </TouchableOpacity>

          {!storeUrl ? (
            <Text style={styles.fallback}>
              {Platform.select({
                ios: 'Please update this app from the App Store.',
                default: 'Please update this app from the Play Store.',
              })}
            </Text>
          ) : (
            <View style={styles.safeRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.safeText}>Your data is safe and secure</Text>
            </View>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

type PillKind = 'outdated' | 'latest';

function Row({
  icon,
  label,
  value,
  valueColor,
  pill,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueColor?: string;
  pill?: PillKind;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        {pill && (
          <View style={[styles.pill, pill === 'latest' ? styles.pillLatest : styles.pillOutdated]}>
            <Text style={[styles.pillText, pill === 'latest' ? styles.pillTextLatest : styles.pillTextOutdated]}>
              {pill === 'latest' ? 'Latest' : 'Outdated'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const CARD_RADIUS = 24;

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  // --- rocket + sparkles ---
  rocketWrap: {
    position: 'absolute',
    top: '9%',
    right: 24,
    width: 130,
    height: 130,
  },
  rocket: {
    position: 'absolute',
    top: 34,
    right: 6,
    transform: [{ rotate: '45deg' }],
  },
  sparkleA: { position: 'absolute', top: 30, left: 6 },
  sparkleB: { position: 'absolute', top: 8, left: 40 },

  // --- logo badge overlapping the card ---
  badge: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: COLORS.primaryDark,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: '#FFFFFF',
    zIndex: 2,
    // sit on top of the card's rounded corner
    marginBottom: -54,
    shadowColor: '#1E3A5F',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  badgeLogo: { width: 70, height: 70 },

  // --- card ---
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: CARD_RADIUS,
    paddingTop: 66,
    paddingHorizontal: 22,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#1E3A5F',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primaryDarker,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14.5,
    lineHeight: 21,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },

  // --- rows block ---
  rows: {
    width: '100%',
    backgroundColor: '#F7FAFE',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF0F8',
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLighter,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primaryDarker,
    fontVariant: ['tabular-nums'],
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 68,
    alignItems: 'center',
  },
  pillLatest: { backgroundColor: COLORS.successLight },
  pillOutdated: { backgroundColor: COLORS.errorLight },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextLatest: { color: '#16A34A' },
  pillTextOutdated: { color: COLORS.error },

  // --- note box ---
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    backgroundColor: '#F7FAFE',
    borderWidth: 1,
    borderColor: '#E6EEF9',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  noteIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },

  // --- button ---
  button: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.5, shadowOpacity: 0 },
  buttonText: {
    color: COLORS.textLight,
    fontSize: 17,
    fontWeight: '800',
  },

  safeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  safeText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  fallback: {
    marginTop: 14,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
