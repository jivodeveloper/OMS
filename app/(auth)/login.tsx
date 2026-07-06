import React, { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Button, Checkbox, HelperText, Text, TextInput } from "react-native-paper";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { COLORS } from "@/src/constants/theme";
import { APP_CONFIG } from "@/src/constants/config";
import { useAuth } from "@/src/context/AuthContext";
import CustomDialog from "@/src/components/common/CustomDialog";

const TECHNICAL_ERROR_PATTERNS = [
  /request timed out/i,
  /network request failed/i,
  /http url may be blocked/i,
  /api url:/i,
  /url:\s*http/i,
];

const getLoginDialogMessage = (message?: string) => {
  if (!message) return "Unable to sign in right now. Please try again later.";
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))
    ? "Unable to sign in right now. Please try again later."
    : message;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CHIP_SIZE = 56;

type ChipIcon =
  | { lib: "ion"; name: React.ComponentProps<typeof Ionicons>["name"] }
  | { lib: "mci"; name: React.ComponentProps<typeof MaterialCommunityIcons>["name"] };

function FloatingChip({
  cx,
  cy,
  index,
  icon,
  color,
  glow,
  appear,
  reduceMotion,
}: {
  cx: number;
  cy: number;
  index: number;
  icon: ChipIcon;
  color: string;
  glow: string;
  appear: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const float = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    float.value = withDelay(
      index * 320,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [float, index, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [
      { translateY: -7 * float.value + (1 - appear.value) * 14 },
      { scale: (0.7 + appear.value * 0.3) * press.value },
    ],
  }));

  return (
    <Animated.View style={[styles.chip, { left: cx - CHIP_SIZE / 2, top: cy - CHIP_SIZE / 2 }, style]}>
      <Pressable
        onPressIn={() => { press.value = withTiming(0.86, { duration: 110 }); }}
        onPressOut={() => { press.value = withSequence(withTiming(1.14, { duration: 130 }), withTiming(1, { duration: 130 })); }}
        style={styles.chipPressable}
      >
        <View style={[styles.chipGlow, { backgroundColor: glow }]} />
        {icon.lib === "ion" ? (
          <Ionicons name={icon.name} size={26} color={color} />
        ) : (
          <MaterialCommunityIcons name={icon.name} size={26} color={color} />
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const { login } = useAuth();
  const reduceMotion = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ username: "", password: "" });
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [dialogTitle, setDialogTitle] = useState("Alert");

  const entrance = useSharedValue(0);
  const field1 = useSharedValue(0);
  const field2 = useSharedValue(0);
  const extras = useSharedValue(0);
  const chips = useSharedValue(0);
  const flow = useSharedValue(0);
  const ambient = useSharedValue(0);
  const shimmer = useSharedValue(-1);
  const arrow = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    entrance.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    field1.value = withDelay(160, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    field2.value = withDelay(280, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    extras.value = withDelay(400, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    chips.value = withDelay(250, withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.4)) }));
    if (reduceMotion) return;
    flow.value = withRepeat(withTiming(-17, { duration: 900, easing: Easing.linear }), -1, false);
    ambient.value = withRepeat(
      withSequence(withTiming(1, { duration: 4500 }), withTiming(0, { duration: 4500 })),
      -1,
    );
    arrow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    shimmer.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
          withDelay(3200, withTiming(-1, { duration: 1 })),
        ),
        -1,
      ),
    );
  }, [ambient, arrow, chips, entrance, extras, field1, field2, flow, reduceMotion, shimmer]);

  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 20 }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 16 }, { scale: 0.96 + entrance.value * 0.04 }],
  }));
  const ambientStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ambient.value * -3 }, { scale: 1 + ambient.value * 0.015 }],
  }));
  const heroBackgroundStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ambient.value * 3 },
      { translateY: ambient.value * -2 },
      { scale: 1.01 + ambient.value * 0.01 },
    ],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value * Math.min(width, 430) }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: extras.value,
    transform: [{ scale: buttonScale.value }, { translateY: (1 - extras.value) * 14 }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: arrow.value * 5 }] }));
  const flowProps = useAnimatedProps(() => ({ strokeDashoffset: flow.value }));
  const rememberStyle = useAnimatedStyle(() => ({
    opacity: extras.value,
    transform: [{ translateY: (1 - extras.value) * 10 }],
  }));
  const usernameStyle = useAnimatedStyle(() => ({
    opacity: field1.value,
    transform: [
      { translateY: (1 - field1.value) * 16 },
      { scale: withTiming(usernameFocused ? 1.01 : 1, { duration: 180 }) },
    ],
  }));
  const passwordStyle = useAnimatedStyle(() => ({
    opacity: field2.value,
    transform: [
      { translateY: (1 - field2.value) * 16 },
      { scale: withTiming(passwordFocused ? 1.01 : 1, { duration: 180 }) },
    ],
  }));

  const credentials = () => ({ username: username.trim(), password: password.trim() });
  const validate = () => {
    const values = credentials();
    const next = {
      username: values.username ? "" : "Username is required",
      password: values.password ? "" : "Password is required",
    };
    setErrors(next);
    return !next.username && !next.password;
  };
  const handleLogin = async () => {
    if (!validate()) return;
    const values = credentials();
    setUsername(values.username);
    setPassword(values.password);
    setLoading(true);
    try {
      const result = await login(values);
      if (result.success) router.replace("/(main)/dashboard" as any);
      else {
        setDialogTitle("Login Failed");
        setDialogMessage(getLoginDialogMessage(result.message));
        setDialogVisible(true);
      }
    } catch {
      setDialogTitle("Error");
      setDialogMessage("Something went wrong. Please try again.");
      setDialogVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const headerHeight = Math.max(380, Math.min(490, height * 0.47));

  // Constellation layout: sun (logo) + three floating chips joined by dashed lines.
  const sun = { x: width * 0.8, y: headerHeight * 0.24, r: Math.min(width * 0.34, 156) };
  const pkg = { x: width * 0.4, y: headerHeight * 0.22 };
  const pin = { x: width * 0.6, y: headerHeight * 0.46 };
  const chk = { x: width * 0.87, y: headerHeight * 0.58 };
  const flowPath =
    `M ${pkg.x} ${pkg.y} ` +
    `Q ${(pkg.x + pin.x) / 2 + 24} ${(pkg.y + pin.y) / 2 - 8} ${pin.x} ${pin.y} ` +
    `Q ${(pin.x + chk.x) / 2 - 12} ${(pin.y + chk.y) / 2 + 22} ${chk.x} ${chk.y}`;
  const branchPath =
    `M ${pkg.x} ${pkg.y} ` +
    `Q ${(pkg.x + sun.x) / 2} ${pkg.y - 34} ${sun.x - sun.r * 0.5} ${sun.y + sun.r * 0.35}`;

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { height: headerHeight }]}>
            <Animated.Image
              source={require("../../assets/images/login-logistics-hero.png")}
              resizeMode="cover"
              style={[styles.heroBackground, heroBackgroundStyle]}
            />
            <View style={styles.headerReadabilityOverlay} />
            <View style={styles.orbit} />

            <Svg width={width} height={headerHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#FFFDF4" stopOpacity={1} />
                  <Stop offset="30%" stopColor="#FFF1C4" stopOpacity={0.98} />
                  <Stop offset="55%" stopColor="#FFDA86" stopOpacity={0.7} />
                  <Stop offset="80%" stopColor="#FFC06A" stopOpacity={0.28} />
                  <Stop offset="100%" stopColor="#FFB25A" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={sun.x} cy={sun.y} r={sun.r} fill="url(#sun)" />
              <Path d={branchPath} stroke="rgba(255,255,255,0.5)" strokeWidth={1.6} strokeDasharray="1.5 7" strokeLinecap="round" fill="none" />
              <AnimatedPath
                animatedProps={flowProps}
                d={flowPath}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={1.8}
                strokeDasharray="2 7"
                strokeLinecap="round"
                fill="none"
              />
            </Svg>

            {[
              { pt: pkg, icon: { lib: "ion", name: "cube" } as ChipIcon, color: "#F5941F", glow: "rgba(255,163,64,0.35)" },
              { pt: pin, icon: { lib: "ion", name: "location" } as ChipIcon, color: "#EC4A4A", glow: "rgba(236,74,74,0.32)" },
              { pt: chk, icon: { lib: "mci", name: "clipboard-check" } as ChipIcon, color: "#7B2CFF", glow: "rgba(123,44,255,0.32)" },
            ].map((chip, index) => (
              <FloatingChip
                key={index}
                cx={chip.pt.x}
                cy={chip.pt.y}
                index={index}
                icon={chip.icon}
                color={chip.color}
                glow={chip.glow}
                appear={chips}
                reduceMotion={reduceMotion}
              />
            ))}

            <Animated.View style={[styles.logoWrap, { left: sun.x - 68, top: sun.y - 32 }, ambientStyle]}>
              <Image
                source={require("../../assets/images/jivo-official-logo.png")}
                style={styles.officialLogo}
                resizeMode="contain"
              />
            </Animated.View>

            <SafeAreaView edges={["top"]} style={styles.safeHeader}>
              <Animated.View style={[styles.welcome, welcomeStyle]}>
                <Text style={styles.welcomeSmall}>Welcome to</Text>
                <Text style={styles.orderText}>Order</Text>
                <Text style={styles.managementText}>Management</Text>
                <Text style={styles.tagline}>Smart orders. Smooth delivery.</Text>
                <LinearGradient colors={["#FFD45C", "#FF7589", "#A95CFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accent} />
              </Animated.View>
            </SafeAreaView>

          </View>

          <Animated.View style={[styles.card, cardStyle]}>
            <View style={styles.cardHeading}>
              <LinearGradient colors={["#6826F4", "#BE42D1"]} style={styles.hexIcon}>
                <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.cardTitle}>Login Credentials</Text>
            </View>

            <Animated.View style={[styles.field, usernameStyle]}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  if (errors.username) setErrors((current) => ({ ...current, username: "" }));
                }}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => { setUsernameFocused(false); setUsername((value) => value.trim()); }}
                mode="outlined"
                placeholder="Enter your username"
                textColor={COLORS.text}
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor="#D8DFEB"
                activeOutlineColor="#7B2CFF"
                placeholderTextColor="#8795B3"
                left={<TextInput.Icon icon="account-outline" color="#52617D" />}
                error={!!errors.username}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
              />
              {!!errors.username && (
                <HelperText type="error" visible style={styles.helper}>{errors.username}</HelperText>
              )}
            </Animated.View>

            <Animated.View style={[styles.field, passwordStyle]}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (errors.password) setErrors((current) => ({ ...current, password: "" }));
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => { setPasswordFocused(false); setPassword((value) => value.trim()); }}
                mode="outlined"
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                textColor={COLORS.text}
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor="#D8DFEB"
                activeOutlineColor="#7B2CFF"
                placeholderTextColor="#8795B3"
                left={<TextInput.Icon icon="lock-outline" color="#52617D" />}
                right={<TextInput.Icon icon={showPassword ? "eye-off-outline" : "eye-outline"} color="#52617D" onPress={() => setShowPassword((value) => !value)} />}
                error={!!errors.password}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
              />
              {!!errors.password && (
                <HelperText type="error" visible style={styles.helper}>{errors.password}</HelperText>
              )}
            </Animated.View>

            <Animated.View style={[styles.rememberRow, rememberStyle]}>
              <Checkbox.Android status={rememberMe ? "checked" : "unchecked"} onPress={() => setRememberMe((value) => !value)} color="#6B28EE" uncheckedColor="#8795B3" />
              <Text style={styles.rememberText} onPress={() => setRememberMe((value) => !value)}>Remember me</Text>
            </Animated.View>

            <Animated.View style={buttonStyle}>
              <LinearGradient colors={["#5C20F2", "#D13C9F", "#FF7418"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                <Animated.View pointerEvents="none" style={[styles.shimmer, shimmerStyle]} />
                <Button
                  mode="contained"
                  onPress={handleLogin}
                  onPressIn={() => { buttonScale.value = withTiming(0.98, { duration: 100 }); }}
                  onPressOut={() => { buttonScale.value = withTiming(1, { duration: 140 }); }}
                  loading={loading}
                  disabled={loading}
                  buttonColor="transparent"
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
                {!loading && (
                  <Animated.View pointerEvents="none" style={[styles.buttonArrow, arrowStyle]}>
                    <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
                  </Animated.View>
                )}
              </LinearGradient>
            </Animated.View>
          </Animated.View>

          <Text style={styles.footer}>{APP_CONFIG.APP_NAME} v{APP_CONFIG.VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <CustomDialog visible={dialogVisible} title={dialogTitle} message={dialogMessage} onClose={() => setDialogVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 8 },
  header: { position: "relative", overflow: "hidden" },
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  headerReadabilityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,23,102,0.16)",
  },
  safeHeader: { zIndex: 4, paddingHorizontal: 26 },
  welcome: { marginTop: 16, width: "64%" },
  welcomeSmall: { color: "#FFFFFF", fontSize: 16, fontWeight: "400" },
  orderText: { color: "#FFFFFF", fontSize: 42, lineHeight: 44, fontWeight: "800", marginTop: 6, letterSpacing: -1 },
  managementText: { color: "#F08AAE", fontSize: 36, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  tagline: { color: "#FFFFFF", fontSize: 14, marginTop: 12 },
  accent: { width: 62, height: 4, borderRadius: 2, marginTop: 13 },
  logoWrap: {
    position: "absolute", width: 136, height: 64, zIndex: 6,
    backgroundColor: "transparent", alignItems: "center", justifyContent: "center",
  },
  officialLogo: { width: 124, height: 56 },
  orbit: { position: "absolute", left: -90, top: -90, width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: "rgba(100,120,255,0.26)" },
  chip: {
    position: "absolute", width: CHIP_SIZE, height: CHIP_SIZE, borderRadius: CHIP_SIZE / 2,
    zIndex: 5, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center",
    shadowColor: "#1B0B45", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5,
  },
  chipPressable: {
    width: CHIP_SIZE, height: CHIP_SIZE, borderRadius: CHIP_SIZE / 2,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  chipGlow: {
    ...StyleSheet.absoluteFillObject, borderRadius: CHIP_SIZE / 2,
  },
  card: { marginHorizontal: 14, marginTop: -52, zIndex: 10, backgroundColor: "rgba(255,255,255,0.99)", borderRadius: 30, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#7B34D3", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 10 },
  cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 13 },
  hexIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", transform: [{ rotate: "30deg" }] },
  cardTitle: { fontSize: 20, fontWeight: "800", color: "#0D2059" },
  field: { marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "700", color: "#102252", marginBottom: 8 },
  input: { height: 58, backgroundColor: "#FBFCFF", fontSize: 15 },
  inputOutline: { borderRadius: 16, borderWidth: 1.4 },
  helper: { marginLeft: 0, paddingLeft: 0, minHeight: 16, height: 16 },
  rememberRow: { flexDirection: "row", alignItems: "center", marginTop: 2, marginLeft: -8, marginBottom: 16 },
  rememberText: { fontSize: 14, fontWeight: "600", color: "#102252" },
  buttonGradient: { height: 60, borderRadius: 16, overflow: "hidden", justifyContent: "center", shadowColor: "#B43A9D", shadowOpacity: 0.3, shadowRadius: 13, elevation: 7 },
  shimmer: { position: "absolute", top: -20, bottom: -20, left: -70, width: 46, backgroundColor: "rgba(255,255,255,0.18)", transform: [{ rotate: "18deg" }] },
  buttonContent: { height: 60 },
  buttonLabel: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  buttonArrow: { position: "absolute", right: 22, top: 18 },
  footer: { textAlign: "center", color: "#56698D", fontSize: 12, marginTop: 14 },
});
