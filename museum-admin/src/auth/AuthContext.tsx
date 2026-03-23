import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { login as apiLogin, getMe } from "@/api/auth.api";
import {
  clearTokens,
  getAccessToken,
  registerLogoutHandler,
  setTokens,
} from "@/api/client";
import type { User } from "@/api/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const didInit = useRef(false);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  // Register the logout handler so the API client can trigger it on 401
  useEffect(() => {
    registerLogoutHandler(logout);
  }, [logout]);

  // On mount, check if we still have a valid token (page refresh)
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setTokens(response.tokens.accessToken, response.tokens.refreshToken);
    setUser(response.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
