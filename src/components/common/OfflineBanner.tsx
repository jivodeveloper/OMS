import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeOnline } from '@/src/utils/network';

/**
 * OfflineBanner — a thin bar that appears at the top of the app whenever the
 * device loses internet, and disappears when it comes back. Mounted once at the
 * root so it covers every screen (login included) without any screen wiring it
 * up. Purely informational: it never blocks interaction.
 */
export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  useEffect(() => subscribeOnline(setOnline), []);

  if (online) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={15} color="#FFFFFF" />
      <Text style={styles.text}>No internet connection. Please turn on the internet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 14,
    backgroundColor: '#DC2626',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
