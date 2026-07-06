import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { PaperProvider } from "react-native-paper";
import { AuthProvider } from "@/src/context/AuthContext";
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
      </PaperProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemedApplication />
      </AuthProvider>
    </ThemeProvider>
  );
}
