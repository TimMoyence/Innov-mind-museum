import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from "react";
import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { authService, clearAccessToken, setAccessToken } from "../services";
import { AUTH_ROUTE } from "@/features/auth/routes";
import { authStorage } from "@/features/auth/infrastructure/authStorage";
import {
  setAuthRefreshHandler,
  setUnauthorizedHandler,
} from "@/shared/infrastructure/httpClient";

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(() => {
});

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  checkTokenValidity: () => Promise<boolean>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Manages authentication state. @returns The current auth context including login status, logout, and token validity check. */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider"
    );
  }
  return context;
};

/** Provides authentication context to the component tree. Bootstraps the session on mount and manages token refresh and logout. */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Check authentication on startup
  useEffect(() => {
    const checkAuth = async (): Promise<void> => {
      try {
        const refreshToken = await authStorage.getRefreshToken();
        if (!refreshToken) {
          setIsAuthenticated(false);
          clearAccessToken();
        } else {
          const session = await authService.refresh(refreshToken);
          await authStorage.setRefreshToken(session.refreshToken);
          setAccessToken(session.accessToken);
          setIsAuthenticated(true);
        }
      } catch (error) {
        await authStorage.clearRefreshToken().catch(() => undefined);
        clearAccessToken();
        setIsAuthenticated(false);
        console.error("Auth bootstrap error:", error);
      } finally {
        setIsLoading(false);
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          /* ignore error */
        }
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    setAuthRefreshHandler(async () => {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      try {
        const session = await authService.refresh(refreshToken);
        await authStorage.setRefreshToken(session.refreshToken);
        setAccessToken(session.accessToken);
        setIsAuthenticated(true);
        return session.accessToken;
      } catch {
        await authStorage.clearRefreshToken().catch(() => undefined);
        clearAccessToken();
        setIsAuthenticated(false);
        return null;
      }
    });

    setUnauthorizedHandler(() => {
      void authStorage.clearRefreshToken().catch(() => {
        /* ignore storage errors */
      });
      clearAccessToken();
      setIsAuthenticated(false);
      router.replace(AUTH_ROUTE);
    });

    return () => {
      setUnauthorizedHandler(null);
      setAuthRefreshHandler(null);
    };
  }, []);

  // Logout function
  const logout = async (): Promise<void> => {
    let refreshToken: string | null = null;
    try {
      refreshToken = await authStorage.getRefreshToken();
      await authStorage.clearRefreshToken();
    } catch (error) {
      console.warn("Error clearing token:", error);
    }

    clearAccessToken();
    setIsAuthenticated(false);
    router.replace(AUTH_ROUTE);

    try {
      await authService.logout(refreshToken);
    } catch (error) {
      console.warn("Error during logout call:", error);
    }
  };

  const checkTokenValidity = async (): Promise<boolean> => {
    try {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) {
        clearAccessToken();
        setIsAuthenticated(false);
        return false;
      }

      const session = await authService.refresh(refreshToken);
      await authStorage.setRefreshToken(session.refreshToken);
      setAccessToken(session.accessToken);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error("Error during token validation:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        logout,
        checkTokenValidity,
        setIsAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
