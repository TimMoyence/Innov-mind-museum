// Configurations API simplifiées
// Choisissez la bonne URL selon votre environnement de développement

// Pour le développement local
export const API_URL = "http://localhost:3000/api/v1/auth";

// Pour l'émulateur Android (décommentez si nécessaire)
// export const API_URL = 'http://10.0.2.2:3000/api/v1/auth';

// Pour un appareil physique sur réseau local (remplacez X.X.X.X par votre IP)
// export const API_URL = 'http://X.X.X.X:3000/api/v1/auth';

// Fonction utilitaire pour construire les URL d'API
export const getApiUrl = (endpoint: string): string => {
  // Si l'endpoint commence déjà par http, on le retourne tel quel
  if (endpoint.startsWith("http")) {
    return endpoint;
  }

  // Si l'endpoint commence par un slash, on le retire
  if (endpoint.startsWith("/")) {
    endpoint = endpoint.substring(1);
  }

  // On construit l'URL complète
  return `${API_URL}/${endpoint}`;
};

// Endpoints d'authentification
export const API_ENDPOINTS = {
  login: "/login",
  register: "/register",
  logout: "/logout",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
};

