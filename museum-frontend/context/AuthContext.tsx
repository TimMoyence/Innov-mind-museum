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

// Empêcher l'écran de démarrage de se cacher automatiquement
SplashScreen.preventAutoHideAsync().catch(() => {
});

const parseJwtExpiration = (token: string): number | null => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  if (typeof globalThis.atob !== "function") {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const payload = JSON.parse(globalThis.atob(padded)) as { exp?: unknown };

    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
};

const isTokenExpired = (token: string): boolean => {
  const expiration = parseJwtExpiration(token);
  if (!expiration) {
    return false;
  }

  return Date.now() >= expiration * 1000;
};

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

// Hook pour utiliser le contexte
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth doit être utilisé à l'intérieur d'un AuthProvider"
    );
  }
  return context;
};

// Fournisseur du contexte
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Vérifier l'authentification au démarrage
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
        console.error("Erreur lors du bootstrap auth:", error);
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

  // Fonction de déconnexion
  const logout = async (): Promise<void> => {
    let refreshToken: string | null = null;
    try {
      refreshToken = await authStorage.getRefreshToken();
      await authStorage.clearRefreshToken();
    } catch (error) {
      console.warn("Erreur lors du nettoyage du token:", error);
    }

    clearAccessToken();
    setIsAuthenticated(false);
    router.replace(AUTH_ROUTE);

    try {
      await authService.logout(refreshToken);
    } catch (error) {
      console.warn("Erreur lors de l'appel logout:", error);
    }
  };

  // Vérifier si un token est valide
  const checkTokenValidity = async (): Promise<boolean> => {
    try {
      const token = await authStorage.getToken();
      if (!token) {
        clearAccessToken();
        setIsAuthenticated(false);
        return false;
      }

      const session = await authService.refresh(token);
      await authStorage.setRefreshToken(session.refreshToken);
      setAccessToken(session.accessToken);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error("Erreur lors de la vérification du token:", error);
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
