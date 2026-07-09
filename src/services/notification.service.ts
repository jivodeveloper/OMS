import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { storage } from "../utils/storage";

// Android channel id. MUST match the backend's `channelId` (see
// OMS Backend/orders/notifications.py -> ANDROID_CHANNEL_ID). Kept as
// "default" so that already-installed clients keep displaying pushes.
export const ANDROID_CHANNEL_ID = "default";

// Foreground presentation: when a push arrives while the app is open we still
// want the full OS notification experience (banner, tray entry, sound, badge)
// rather than silently swallowing it (Task 6). `shouldShowAlert` is omitted as
// it is deprecated in favour of banner/list in expo-notifications SDK 54.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Remember the last token we successfully registered so we don't spam the
// backend with identical registrations on every navigation/user refresh.
let lastRegisteredToken: string | null = null;

// Re-entrancy guard. Fetching an Expo token can itself fire the push-token
// listener, so without this a refresh -> register -> getToken -> refresh cycle
// would loop forever (the bug this guard fixes).
let isRegistering = false;

// Transient-failure backoff bounds.
const MAX_REGISTER_ATTEMPTS = 4;
const MAX_BACKOFF_MS = 30000;

const hasValidAccessToken = async (): Promise<boolean> => {
  try {
    const token = await storage.getAccessToken();
    return !!token;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /**
   * Create/refresh the Android notification channel with production-grade
   * settings: high importance (heads-up + sound), default sound, vibration,
   * public lock-screen visibility and badge support (Task 4).
   *
   * Idempotent and safe to call on every launch. NOTE: Android locks a
   * channel's importance/sound/visibility after first creation, so existing
   * installs keep whatever they were first given (the previous version already
   * used MAX importance + vibration); fresh installs get the full config.
   */
  async ensureAndroidChannel() {
    if (Platform.OS !== "android") return;

    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Order updates",
        description: "Approvals, rejections and order status changes",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lightColor: "#2563EB",
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
        bypassDnd: false,
      });
    } catch (error) {
      console.log("Failed to configure Android notification channel:", error);
    }
  },

  /**
   * Read the current OS permission WITHOUT prompting. Returns the Expo
   * permission status plus `canAskAgain` (false on iOS once denied → the app
   * must send the user to system Settings).
   */
  async getPermissionStatus(): Promise<{
    status: string;
    canAskAgain: boolean;
  }> {
    try {
      const current = await Notifications.getPermissionsAsync();
      return {
        status: current.status,
        canAskAgain: current.canAskAgain ?? true,
      };
    } catch {
      return { status: "undetermined", canAskAgain: true };
    }
  },

  /**
   * Explicitly ask the OS for permission. Call this ONLY after the user taps
   * "Allow Notifications" in our own modal — never automatically.
   */
  async requestOSPermission(): Promise<string> {
    try {
      const result = await Notifications.requestPermissionsAsync();
      return result.status;
    } catch {
      return "undetermined";
    }
  },

  async registerForPushNotifications(options?: { requestIfNeeded?: boolean }) {
    const requestIfNeeded = options?.requestIfNeeded ?? false;

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

    let status: string = (await Notifications.getPermissionsAsync()).status;

    // Only prompt the OS when explicitly allowed (i.e. from our custom modal's
    // "Allow" button). The default auto-registration path never prompts — it
    // registers silently if permission was already granted, otherwise no-ops.
    if (status !== "granted" && requestIfNeeded) {
      status = await this.requestOSPermission();
    }

    if (status !== "granted") {
      console.log("Push notification permission not granted; skipping token.");
      return null;
    }

    await this.ensureAndroidChannel();

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
    // 1. Never touch the endpoint without a valid JWT. If the user is not
    //    logged in, skip silently and wait for login — no request, no retry.
    if (!(await hasValidAccessToken())) {
      return null;
    }

    // 2. Re-entrancy guard: prevents the refresh-listener loop and concurrent
    //    registrations. If one is already in flight, this call is a no-op.
    if (isRegistering) {
      return null;
    }
    isRegistering = true;
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

      // Already registered this exact token this session — nothing to do.
      if (token === lastRegisteredToken) {
        return { success: true, skipped: true };
      }

      return await this._postTokenWithBackoff(token, 0);
    } catch (error) {
      console.log("Error registering push notification token:", error);
      return null;
    } finally {
      isRegistering = false;
    }
  },

  /**
   * POST the token, retrying ONLY transient failures (offline / timeout / 5xx)
   * with exponential backoff. Auth failures (401/403) and other 4xx are never
   * retried — they mean "not authenticated" or "bad request", so retrying would
   * just loop.
   */
  async _postTokenWithBackoff(token: string, attempt: number): Promise<any> {
    const response = await api.post("/orders/push-token/", {
      token,
      platform: Platform.OS,
    });

    const status: number | undefined = response?.status;

    // Auth / authorization failure -> stop immediately. Do NOT retry, do NOT
    // loop. Registration resumes after the next successful login.
    if (status === 401 || status === 403) {
      console.log(
        "Push token registration rejected (auth); will retry after login.",
      );
      return null;
    }

    // Success: the API returns the backend JSON (no `status` on 2xx).
    if (response && response.success !== false) {
      lastRegisteredToken = token;
      return response;
    }

    // Transient failure: no HTTP status (network/offline/timeout) or a 5xx.
    const isTransient = status === undefined || status >= 500;
    if (isTransient && attempt < MAX_REGISTER_ATTEMPTS) {
      // Bail out if the user logged out while we were waiting.
      if (!(await hasValidAccessToken())) {
        return null;
      }
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
      await sleep(delay);
      if (!(await hasValidAccessToken())) {
        return null;
      }
      return this._postTokenWithBackoff(token, attempt + 1);
    }

    // Non-retryable 4xx (e.g. 400) or attempts exhausted.
    return response ?? null;
  },

  /**
   * User-initiated flow (from our "Allow Notifications" modal): prompt the OS,
   * and if granted, register the Expo token exactly once. Returns the resulting
   * OS status so the caller can persist granted/denied.
   */
  async requestPermissionAndRegister(): Promise<string> {
    const status = await this.requestOSPermission();
    if (status === "granted") {
      await this.ensureAndroidChannel();
      await this.registerDeviceToken();
    }
    return status;
  },

  /**
   * Subscribe to Expo push-token rotations. When the OS/Expo issues a new
   * token we re-register it — but only while authenticated (Task 8 - token
   * refresh). The re-entrancy guard in registerDeviceToken() breaks the
   * listener -> register -> getToken -> listener loop.
   *
   * Returns the subscription so the caller can remove it on unmount.
   */
  subscribeToTokenRefresh() {
    return Notifications.addPushTokenListener(async () => {
      // Only re-register when authenticated; otherwise wait for login.
      if (!(await hasValidAccessToken())) {
        return;
      }
      // Force a re-register of the (potentially new) token. Safe: if a
      // registration is already running, registerDeviceToken() no-ops.
      if (!isRegistering) {
        lastRegisteredToken = null;
        this.registerDeviceToken();
      }
    });
  },

  /**
   * Deactivate this device's token on the backend (Task 8 - logout cleanup).
   * Must be called while the auth token is still available (i.e. before
   * clearing storage on logout). Reuses the existing PushToken model via the
   * optional DELETE endpoint; failures are non-fatal.
   */
  async deactivateDeviceToken() {
    try {
      const token =
        lastRegisteredToken || (await this.registerForPushNotifications());
      lastRegisteredToken = null;
      if (!token) {
        return null;
      }

      return await api.delete("/orders/push-token/", {
        token,
        platform: Platform.OS,
      });
    } catch (error) {
      console.log("Error deactivating push notification token:", error);
      return null;
    }
  },
};
