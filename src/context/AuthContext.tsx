import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { Alert, AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { storage } from "../utils/storage";
import { authService, User, LoginRequest } from "../services/auth.service";
import { notificationService } from "../services/notification.service";
import {
  getNotificationDedupeKey,
  type OMSNotificationData,
} from "../utils/notificationRouting";
import { suppressPendingNotification } from "../utils/notificationGate";
import {
  api,
  ensureFreshAccessToken,
  isAccessTokenExpired,
  setSessionExpiredHandler,
} from "../services/api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (
    credentials: LoginRequest,
  ) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeUser = (user: User): User => {
  const states = Array.isArray(user.states)
    ? user.states.filter(Boolean)
    : user.state
      ? [user.state]
      : [];

  return {
    ...user,
    state: user.state || states[0] || null,
    states,
  };
};

const getFieldErrorMessage = (errors: any): string | null => {
  if (!errors || typeof errors !== "object") return null;

  const parts = Object.entries(errors)
    .map(([field, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${value.join(", ")}`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
      return null;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Whether to SUPPRESS the "Session expired" alert. Default true so it never
  // fires during app startup / before a healthy session exists. It's flipped
  // off once a valid session is confirmed, and back on during intentional
  // login/logout — so the alert appears ONLY on a genuine mid-session failure.
  const suppressSessionAlert = useRef(true);

  // Check for existing session on app start
  useEffect(() => {
    checkAuth();
  }, []);

  // When a refresh ultimately fails, the API layer hands off here to end the
  // session cleanly (tokens are already cleared): drop the user and route to
  // login. Navigation ALWAYS happens; the alert is shown only for a genuine
  // mid-session expiry (not during login/logout/startup). Guarded, never loops.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      router.replace("/(auth)/login" as never);
      if (!suppressSessionAlert.current) {
        suppressSessionAlert.current = true; // don't repeat on the login screen
        Alert.alert(
          "Session expired",
          "Your session has expired. Please login again.",
        );
      }
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Background resume (Task 8): if the access token expired while the app was
  // backgrounded, refresh proactively so the user isn't hit by failing APIs.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        ensureFreshAccessToken();
      }
    });
    return () => subscription.remove();
  }, []);

  const checkAuth = async () => {
    try {
      // Startup (Task 7): if the access token is expired but the refresh token
      // is still valid, refresh silently so no login screen appears.
      await ensureFreshAccessToken();

      const token = await storage.getAccessToken();
      const savedUser = await storage.getUser();

      if (token && savedUser) {
        setUser(normalizeUser(savedUser));
        // Only arm the "session expired" alert once we have a genuinely valid
        // session; a dead session at startup routes to login silently.
        if (!isAccessTokenExpired(token)) {
          suppressSessionAlert.current = false;
        }
      } else {
        // App launched UNAUTHENTICATED. If a notification opened the app, its
        // deep-link must NOT fire after the user logs in (Task: CASE 4). Record
        // that launch notification so the (main) handler skips exactly it — the
        // user lands on Home after login, not on Order Details.
        try {
          const launch = await Notifications.getLastNotificationResponseAsync();
          if (launch) {
            const req = launch.notification.request;
            const data = (req.content.data || {}) as OMSNotificationData;
            suppressPendingNotification(
              getNotificationDedupeKey(req.identifier, data),
            );
          }
        } catch {
          /* no launch notification / API unavailable — nothing to suppress */
        }
      }
    } catch (error) {
      console.log("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authService.login(credentials);

      if (response.success && response.data) {
        const { tokens } = response.data;
        const user = normalizeUser(response.data.user);

        await storage.saveTokens(tokens.access, tokens.refresh);
        await storage.saveUser(user);

        // The user just authenticated via the login screen. If a notification
        // cold-started the app, it must NOT deep-link now — they land on Home.
        // (Fresh in-session taps carry different keys and are unaffected; an
        // already-valid session that auto-logs in still deep-links normally.)
        // This runs BEFORE setUser so the (main) deep-link handler sees the key
        // as suppressed the moment it mounts.
        try {
          const launch = await Notifications.getLastNotificationResponseAsync();
          if (launch) {
            const req = launch.notification.request;
            const data = (req.content.data || {}) as OMSNotificationData;
            suppressPendingNotification(
              getNotificationDedupeKey(req.identifier, data),
            );
          }
        } catch {
          /* no launch notification — nothing to suppress */
        }

        // Fresh healthy session — arm the genuine-expiry alert going forward.
        suppressSessionAlert.current = false;
        setUser(user);

        return { success: true, message: "Login successful" };
      }

      const nonFieldErrors =
        (response as any)?.errors?.non_field_errors?.[0] ||
        (response as any)?.data?.errors?.non_field_errors?.[0];
      const fieldErrors =
        getFieldErrorMessage((response as any)?.errors) ||
        getFieldErrorMessage((response as any)?.data?.errors);
      const technicalError = (response as any)?.error;
      const baseUrlTried = (response as any)?.baseUrlTried;

      return {
        success: false,
        message:
          nonFieldErrors ||
          fieldErrors ||
          (technicalError
            ? `${response?.message || "Login failed"} (${technicalError}${baseUrlTried ? `, URL: ${baseUrlTried}` : ""})`
            : response?.message || "Login failed"),
      };
    } catch (error) {
      console.log("Login error:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Network error. Please try again.",
      };
    }
  };

  // Pull the latest user (incl. extra_pages page grants) from the backend so
  // permission changes made elsewhere — e.g. from the web admin — take effect
  // without requiring the user to log out and back in.
  const refreshUser = async () => {
    try {
      const token = await storage.getAccessToken();
      if (!token) return;

      const response = await authService.getProfile(token);
      if (response?.success && response.data) {
        const freshUser = normalizeUser(response.data);
        await storage.saveUser(freshUser);
        setUser(freshUser);
      }
    } catch (error) {
      console.log("Refresh user failed:", error);
    }
  };

  const logout = async () => {
    // Intentional sign-out: never show the "session expired" alert for any
    // 401s the cleanup calls below may trigger.
    suppressSessionAlert.current = true;

    // Snapshot tokens for background server-side revocation before we clear.
    const [access, refresh] = await Promise.all([
      storage.getAccessToken(),
      storage.getRefreshToken(),
    ]);

    // Instantly drop the user so the UI/guards reflect sign-out immediately.
    setUser(null);

    // Everything else is best-effort and runs in the BACKGROUND so logout feels
    // instant and a slow/offline network never blocks it:
    //   • blacklist the refresh token server-side
    //   • deactivate this device's push token (while storage still has a token)
    //   • clear local storage
    void (async () => {
      try {
        if (access && refresh) {
          api.post("/auth/logout/", { refresh }, access).catch(() => undefined);
        }
        try {
          await notificationService.deactivateDeviceToken();
        } catch (error) {
          console.log("Failed to deactivate push token on logout:", error);
        }
      } finally {
        await storage.clear();
      }
    })();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
  
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
