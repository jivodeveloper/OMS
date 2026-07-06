import React, { createContext, useContext, useState, useEffect } from "react";
import { storage } from "../utils/storage";
import { authService, User, LoginRequest } from "../services/auth.service";
import { notificationService } from "../services/notification.service";

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

  // Check for existing session on app start
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await storage.getAccessToken();
      const savedUser = await storage.getUser();

      if (token && savedUser) {
        setUser(normalizeUser(savedUser));
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
        
        storage.getAccessToken().then((storedToken) => {
          console.log('Stored Access Token after login:', storedToken);
        }
        );

        console.log("Login successful, user:", user);
        console.log("Login successful, tokens:",tokens.access);
        console.log("Saved user in storage:", await storage.getUser());

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
    // Deactivate this device's push token BEFORE clearing storage, while the
    // auth token is still available to authorise the request. Non-fatal: a
    // failure here must never block sign-out.
    try {
      await notificationService.deactivateDeviceToken();
    } catch (error) {
      console.log("Failed to deactivate push token on logout:", error);
    }

    await storage.clear();
    setUser(null);
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
