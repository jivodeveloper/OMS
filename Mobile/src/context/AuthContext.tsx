import React, { createContext, useContext, useState, useEffect } from "react";
import { storage } from "../utils/storage";
import { authService, User, LoginRequest } from "../services/auth.service";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (
    credentials: LoginRequest,
  ) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        setUser(savedUser);
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
        const { user, tokens } = response.data;

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

      return { success: false, message: response.message || "Login failed" };
    } catch (error) {
      console.log("Login error:", error);
      return { success: false, message: "Network error. Please try again." };
    }
  };

  const logout = async () => {
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
