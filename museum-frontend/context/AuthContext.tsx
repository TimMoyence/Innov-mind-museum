import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { setJwtToken } from "./api";

// Empêcher l'écran de démarrage de se cacher automatiquement
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
        const token = await AsyncStorage.getItem("userToken");
        setIsAuthenticated(!!token);
        setJwtToken(token);
      } catch (error) {
        console.error("Erreur lors de la vérification du token:", error);
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

  // Fonction de déconnexion
  const logout = async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem("userToken");
      setJwtToken("");
      setIsAuthenticated(false);
      router.navigate("/");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  // Vérifier si un token est valide
  const checkTokenValidity = async (): Promise<boolean> => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      if (!token) {
        setJwtToken("");
        setIsAuthenticated(false);
        return false;
      }

      setJwtToken(token);

      // Ici on peut appeler l'API pour vérifier la validité du token

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
