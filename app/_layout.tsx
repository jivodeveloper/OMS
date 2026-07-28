import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar, StyleSheet, View } from "react-native";
import { PaperProvider } from "react-native-paper";
import { AuthProvider } from "@/src/context/AuthContext";
import { UpdateProvider, useUpdate } from "@/src/context/UpdateContext";
import AppDialogHost from "@/src/components/common/AppDialog";
import ToastHost from "@/src/components/common/Toast";
import OfflineBanner from "@/src/components/common/OfflineBanner";
import UpdateRequiredScreen from "@/src/components/common/UpdateRequiredScreen";
import {
  darkNavigationTheme,
  darkPaperTheme,
  lightNavigationTheme,
  lightPaperTheme,
  ThemeProvider,
  useAppTheme,
} from "@/src/theme";

function ThemedApplication() {
  const { theme, resolvedScheme } = useAppTheme();
  const navigationTheme =
    resolvedScheme === "dark" ? darkNavigationTheme : lightNavigationTheme;
  const paperTheme =
    resolvedScheme === "dark" ? darkPaperTheme : lightPaperTheme;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <PaperProvider theme={paperTheme}>
        <StatusBar
          barStyle={theme.colors.statusBarStyle}
          backgroundColor={theme.colors.background}
          translucent={false}
        />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
        {/* App-wide branded dialog (replaces OS Alert/confirm boxes). */}
        <AppDialogHost />
        {/* App-wide non-blocking toast (success/error feedback). */}
        <ToastHost />
        {/* App-wide offline indicator — shows a top bar whenever there is no
            internet, on every screen including login. */}
        <OfflineBanner />
        {/* Force-update gate — rendered ABOVE the navigator, so when active it
            covers the entire app and blocks all navigation without any screen
            being aware of it. */}
        <ForceUpdateGate />
      </PaperProvider>
    </NavigationThemeProvider>
  );
}

/** Full-screen overlay shown while the backend requires an app update.
 *  Absolutely positioned over everything, so it covers the whole navigator and
 *  intercepts all touches — the app underneath is completely unreachable. */
function ForceUpdateGate() {
  const { updateRequired } = useUpdate();
  if (!updateRequired) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <UpdateRequiredScreen />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <UpdateProvider>
        <AuthProvider>
          <ThemedApplication />
        </AuthProvider>
      </UpdateProvider>
    </ThemeProvider>
  );
}
