import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const getProjectId = () =>
  Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error || "");

const isExpoTokenNetworkFailure = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("fetching expo token") ||
    message.includes("network request failed") ||
    message.includes("failed to fetch")
  );
};

const isLikelyAndroidEmulator = () => {
  if (Platform.OS !== "android") return false;

  const constants = (Platform.constants || {}) as Record<string, unknown>;
  const fingerprint = String(constants.Fingerprint || "").toLowerCase();
  const model = String(constants.Model || "").toLowerCase();
  const brand = String(constants.Brand || "").toLowerCase();
  const manufacturer = String(constants.Manufacturer || "").toLowerCase();
  const product = String(constants.Product || "").toLowerCase();
  const device = String(constants.Device || "").toLowerCase();

  return [
    fingerprint.includes("generic"),
    fingerprint.includes("emulator"),
    model.includes("sdk"),
    model.includes("emulator"),
    brand.startsWith("generic"),
    manufacturer.includes("genymotion"),
    product.includes("sdk"),
    product.includes("emulator"),
    device.includes("emulator"),
  ].some(Boolean);
};

export const notificationService = {
  async registerForPushNotifications() {
    if (Platform.OS === "web") {
      console.log("Skipping push notification registration on web.");
      return null;
    }

    if (isLikelyAndroidEmulator()) {
      console.log(
        "Skipping Expo push token registration on Android emulator. Use a physical device to test remote push notifications.",
      );
      return null;
    }

    const currentPermission = await Notifications.getPermissionsAsync();
    let status = currentPermission.status;

    if (status !== "granted") {
      const requestedPermission = await Notifications.requestPermissionsAsync();
      status = requestedPermission.status;
    }

    if (status !== "granted") {
      console.log("Push notification permission was not granted.");
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#2563EB",
      });
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.log("Missing EAS project ID for push notifications.");
      return null;
    }

    try {
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data;
    } catch (error) {
      if (isExpoTokenNetworkFailure(error)) {
        console.log(
          "Skipping Expo push token registration because the Expo token service is unreachable in this environment.",
        );
        return null;
      }
      throw error;
    }
  },

  async registerDeviceToken(tokenOverride?: string | null) {
    try {
      const shouldRefreshExpoToken =
        Platform.OS === "ios" &&
        !!tokenOverride &&
        !tokenOverride.startsWith("ExponentPushToken[");
      const token =
        shouldRefreshExpoToken || !tokenOverride
          ? await this.registerForPushNotifications()
          : tokenOverride;
      if (!token) {
        return null;
      }

      return await api.post("/orders/push-token/", {
        token,
        platform: Platform.OS,
      });
    } catch (error) {
      console.log("Error registering push notification token:", error);
      return null;
    }
  },
};
