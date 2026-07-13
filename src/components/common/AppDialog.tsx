import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";

/**
 * App-wide branded dialog — a consistent replacement for the OS `Alert.alert`
 * / confirm boxes. Mount <AppDialogHost /> once near the app root, then call
 * `appAlert(...)` (drop-in for Alert.alert) or `showAppDialog(...)` from
 * anywhere. No React context needed (module-level store, like a toast).
 */

export type AppDialogButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

type Tone = "info" | "success" | "error" | "warning";

export type AppDialogOptions = {
  title?: string;
  message?: string;
  buttons?: AppDialogButton[];
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  dismissable?: boolean;
};

let notify: ((options: AppDialogOptions | null) => void) | null = null;

export const showAppDialog = (options: AppDialogOptions) => notify?.(options);
export const hideAppDialog = () => notify?.(null);

/** Drop-in replacement for `Alert.alert(title, message, buttons)`.
 * Auto-tones from the title ("Success" → green, "Error"/"Failed" → red). */
export const appAlert = (
  title?: string,
  message?: string,
  buttons?: AppDialogButton[],
) => {
  const t = (title || "").toLowerCase();
  const tone: Tone = t.includes("success")
    ? "success"
    : t.includes("error") || t.includes("fail")
      ? "error"
      : t.includes("warn")
        ? "warning"
        : "info";
  showAppDialog({ title, message, buttons, tone });
};

const TONE_COLOR: Record<Tone, string> = {
  info: COLORS.primary,
  success: COLORS.success,
  error: COLORS.error,
  warning: "#F59E0B",
};

const TONE_ICON: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  info: "information-circle",
  success: "checkmark-circle",
  error: "alert-circle",
  warning: "warning",
};

export default function AppDialogHost() {
  const [options, setOptions] = useState<AppDialogOptions | null>(null);

  useEffect(() => {
    notify = setOptions;
    return () => {
      notify = null;
    };
  }, []);

  if (!options) return null;

  const tone = options.tone ?? "info";
  const accent = TONE_COLOR[tone];
  const icon = options.icon ?? TONE_ICON[tone];
  const buttons =
    options.buttons && options.buttons.length
      ? options.buttons
      : [{ text: "OK" } as AppDialogButton];
  const isRow = buttons.length > 1 && buttons.length <= 2;

  const close = () => setOptions(null);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (options.dismissable !== false) close();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: accent + "1A" }]}>
            <Ionicons name={icon} size={30} color={accent} />
          </View>

          {!!options.title && <Text style={styles.title}>{options.title}</Text>}
          {!!options.message && (
            <Text style={styles.message}>{options.message}</Text>
          )}

          <View style={[styles.actions, isRow && styles.actionsRow]}>
            {buttons.map((button, index) => {
              const isCancel = button.style === "cancel";
              const isDestructive = button.style === "destructive";
              return (
                <TouchableOpacity
                  key={`${button.text}-${index}`}
                  activeOpacity={0.85}
                  style={[
                    styles.btn,
                    isRow && styles.btnFlex,
                    isCancel
                      ? styles.btnCancel
                      : {
                          backgroundColor: isDestructive
                            ? COLORS.error
                            : accent,
                        },
                  ]}
                  onPress={() => {
                    close();
                    button.onPress?.();
                  }}
                >
                  <Text
                    style={[styles.btnText, isCancel && styles.btnCancelText]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
  },
  actions: {
    alignSelf: "stretch",
    marginTop: 20,
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
  },
  btn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnFlex: {
    flex: 1,
  },
  btnCancel: {
    backgroundColor: "#F1F5F9",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  btnCancelText: {
    color: COLORS.textSecondary,
  },
});
