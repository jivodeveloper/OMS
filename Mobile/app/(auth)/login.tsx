import React, { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  StatusBar,
} from "react-native";
import { TextInput, Button, Text, HelperText } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { APP_CONFIG } from "@/src/constants/config";
import { useAuth } from "@/src/context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ username: "", password: "" });

  const validate = (): boolean => {
    const newErrors = { username: "", password: "" };
    let isValid = true;

    if (!username.trim()) {
      newErrors.username = "Username is required";
      isValid = false;
    }

    if (!password.trim()) {
      newErrors.password = "Password is required";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const result = await login({ username, password });
      console.log(JSON.stringify(result));

      if (result.success) {
        router.replace("/(main)/dashboard" as any);
      } else {
        Alert.alert(result.message, "Please try again.");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primaryDark}
      />

      {/* Gradient Header */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <SafeAreaView edges={["top"]}>
          <View style={styles.headerContent}>
            <Text style={styles.welcomeText}>Welcome to</Text>
            <Text style={styles.appName}>{APP_CONFIG.APP_NAME}</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Login Card */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>LOGIN CREDENTIALS</Text>
            </View>

            {/* Username */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                value={username}
                textColor={COLORS.black}
                onChangeText={(text) => {
                  setUsername(text);
                  if (errors.username) setErrors({ ...errors, username: "" });
                }}
                mode="outlined"
                placeholder="Enter your username"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                placeholderTextColor={COLORS.textMuted}
                left={
                  <TextInput.Icon
                    icon="account-outline"
                    color={COLORS.textSecondary}
                  />
                }
                error={!!errors.username}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <HelperText
                type="error"
                visible={!!errors.username}
                style={styles.helperText}
              >
                {errors.username}
              </HelperText>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                textColor={COLORS.black}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors({ ...errors, password: "" });
                }}
                mode="outlined"
                placeholder="Enter your password"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry={!showPassword}
                left={
                  <TextInput.Icon
                    icon="lock-outline"
                    color={COLORS.textSecondary}
                  />
                }
                right={
                  <TextInput.Icon
                    icon={showPassword ? "eye-off-outline" : "eye-outline"}
                    color={COLORS.textSecondary}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
                error={!!errors.password}
              />
              <HelperText
                type="error"
                visible={!!errors.password}
                style={styles.helperText}
              >
                {errors.password}
              </HelperText>
            </View>

            {/* Login Button */}
            <LinearGradient
              colors={[COLORS.primaryDark, COLORS.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Button
                mode="contained"
                onPress={handleLogin}
                loading={loading}
                disabled={loading}
                style={styles.button}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
                buttonColor="transparent"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </LinearGradient>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            {APP_CONFIG.APP_NAME} v{APP_CONFIG.VERSION}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl + 40,
    position: "relative",
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -50,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -60,
    left: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  headerContent: {
    marginTop: SPACING.xl,
  },
  welcomeText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "400",
  },
  appName: {
    fontSize: 28,
    color: COLORS.textLight,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: SPACING.sm,
  },
  keyboardView: {
    flex: 1,
    marginTop: -40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E8EEF4",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  sectionIndicator: {
    width: 3,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  field: {
    marginBottom: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  inputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  helperText: {
    marginLeft: 0,
    paddingLeft: 0,
  },
  buttonGradient: {
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
  },
  button: {
    borderRadius: RADIUS.md,
  },
  buttonContent: {
    paddingVertical: SPACING.sm,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textLight,
  },
  footer: {
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: SPACING.xl,
  },
});
