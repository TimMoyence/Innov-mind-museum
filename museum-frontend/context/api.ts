// Configurations API pour le projet NOAVISIT
// Configurez l'URL de base selon votre environnement de développement

// URL de base pour tous les endpoints API
export const BASE_API_URL = "http://localhost:3000";

// URL spécifique pour l'authentification
export const AUTH_API_URL = `${BASE_API_URL}/api/v1/auth`;

// Pour l'émulateur Android (décommentez si nécessaire)
// export const BASE_API_URL = "http://10.0.2.2:3000";
// export const AUTH_API_URL = `${BASE_API_URL}/api/v1/auth`;

// Pour un appareil physique sur réseau local (remplacez X.X.X.X par votre IP)
// export const BASE_API_URL = "http://X.X.X.X:3000";
// export const AUTH_API_URL = `${BASE_API_URL}/api/v1/auth`;

let JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0aW0ubW95ZW5jZUBvdXRsb29rLmZyIiwiaWF0IjoxNzQ2OTc4MjczLCJleHAiOjE3NDcwNjQ2NzN9.fS0TDNEk989UqGO2v1xmHp55N_YeDa0Lr5JyoPR-pUg";

export const API_ENDPOINTS = {
  auth: {
    login: "/login",
    register: "/register",
    logout: "/logout",
    forgotPassword: "/forgot-password",
    resetPassword: "/reset-password",
  },
  conversation: {
    getById: (id: string) => `/conversation/${id}`,
    getAll: "/conversation/all",
    getByUser: (userId: string) => `/conversation/all/${userId}`,
  },
  ia: {
    museum: "/ia/museum",
    imageInsight: "/image-insight",
  },
};

// Fonction utilitaire pour construire les URL d'API
export const getApiUrl = (endpoint: string, category?: string): string => {
  // Si l'endpoint commence déjà par http, on le retourne tel quel
  if (endpoint.startsWith("http")) {
    return endpoint;
  }

  // Si l'endpoint commence par un slash, on le garde
  if (!endpoint.startsWith("/")) {
    endpoint = `/${endpoint}`;
  }

  // Si une catégorie est spécifiée, on utilise la base URL et on ajoute api/v1/{category}
  if (category) {
    return `${BASE_API_URL}/api/v1${endpoint}`;
  }

  // Par défaut, on considère que c'est un endpoint d'authentification
  return `${AUTH_API_URL}${endpoint}`;
};

export const getAuthHeaders = () => {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${JWT_TOKEN}`,
  };
};

export const setJwtToken = (token: string) => {
  JWT_TOKEN = token;
};

export const getJwtToken = (): string => {
  return JWT_TOKEN;
};

export const AuthService = {
  register: async (userData: any) => {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.auth.register), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur d'inscription ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erreur d'inscription:", error);
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.auth.login), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur de connexion ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      // Stocker le token pour les futures requêtes
      if (data.token) {
        setJwtToken(data.token);
      }

      return data;
    } catch (error) {
      console.error("Erreur de connexion:", error);
      throw error;
    }
  },

  logout: async () => {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.auth.logout), {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur de déconnexion ${response.status}: ${errorText}`
        );
      }

      // Effacer le token
      setJwtToken("");

      return await response.json();
    } catch (error) {
      console.error("Erreur de déconnexion:", error);
      throw error;
    }
  },

  forgotPassword: async (email: string) => {
    try {
      const response = await fetch(
        getApiUrl(API_ENDPOINTS.auth.forgotPassword),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur de demande de réinitialisation ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erreur de demande de réinitialisation:", error);
      throw error;
    }
  },

  resetPassword: async (token: string, newPassword: string) => {
    try {
      const response = await fetch(
        getApiUrl(API_ENDPOINTS.auth.resetPassword),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token, newPassword }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur de réinitialisation ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erreur de réinitialisation:", error);
      throw error;
    }
  },
};

export const ConversationService = {
  getConversation: async (conversationId: string) => {
    try {
      const response = await fetch(
        getApiUrl(
          API_ENDPOINTS.conversation.getById(conversationId),
          "conversation"
        ),
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur de récupération de conversation ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erreur de récupération de conversation:", error);
      throw error;
    }
  },

  getAllConversations: async () => {
    try {
      const response = await fetch(
        getApiUrl(API_ENDPOINTS.conversation.getAll, "conversation"),
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur de récupération des conversations ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erreur de récupération des conversations:", error);
      return [];
    }
  },

  getUserConversations: async (userId: string) => {
    try {
      const response = await fetch(
        getApiUrl(API_ENDPOINTS.conversation.getByUser(userId), "conversation"),
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur de récupération des conversations de l'utilisateur ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error(
        "Erreur de récupération des conversations de l'utilisateur:",
        error
      );
      return [];
    }
  },
};

export const IAService = {
  // Fonction améliorée pour analyser les images avec plus de débogage
  analyzeImage: async (imageUri: string, conversationId?: string) => {
    try {
      console.log("Analyse de l'image - URI complet:", imageUri);

      // Vérifier si l'URI est valide
      if (!imageUri) {
        console.error("URI d'image invalide ou vide");
        throw new Error("URI d'image invalide");
      }

      // Vérifier si le fichier existe (pour débogage)
      console.log("Type d'URI:", typeof imageUri);
      console.log("Longueur de l'URI:", imageUri.length);
      console.log("L'URI commence par:", imageUri.substring(0, 30) + "...");

      // Créer un objet FormData
      const formData = new FormData();

      // Traiter l'URI en fonction de son format
      // Les photos de caméra sur React Native ont généralement un format comme:
      // - iOS: 'file:///var/mobile/Containers/Data/Application/...'
      // - Android: 'file:///data/user/0/com.yourapp/cache/...' ou 'content://...'

      // Extraire le type de fichier à partir de l'URI (jpg par défaut pour les photos de caméra)
      let fileType = "jpg";
      if (imageUri.includes(".")) {
        const uriParts = imageUri.split(".");
        fileType = uriParts[uriParts.length - 1];
      }

      console.log("Type de fichier détecté:", fileType);

      // Créer un objet fichier pour React Native avec des logs explicites
      const fileObject = {
        uri: imageUri,
        name: `photo.${fileType}`,
        type: `image/${fileType}`,
      };

      console.log("Objet fichier créé:", JSON.stringify(fileObject));

      // Ajouter l'image au FormData - UTILISER LE NOM DE CHAMP 'image' EXACTEMENT
      formData.append("image", fileObject as any);

      // Si un conversationId est fourni, l'ajouter également
      if (conversationId) {
        formData.append("conversationId", conversationId);
        console.log("ConversationId ajouté:", conversationId);
      }

      console.log("FormData créé avec les champs appropriés");

      // Log détaillé de la requête
      console.log(
        "Envoi de la requête à:",
        getApiUrl(API_ENDPOINTS.ia.imageInsight, "image-insight")
      );
      console.log("Méthode:", "POST");
      console.log("Headers:", {
        Authorization: `Bearer ${getJwtToken().substring(0, 15)}...`,
      });
      console.log("Type de body:", typeof formData);

      // Envoyer la requête avec le FormData
      const response = await fetch(
        getApiUrl(API_ENDPOINTS.ia.imageInsight, "image-insight"),
        {
          method: "POST",
          headers: {
            // NE PAS définir 'Content-Type' pour FormData - le navigateur le fait automatiquement
            Authorization: `Bearer ${getJwtToken()}`,
          },
          body: formData,
        }
      );

      // Log détaillé de la réponse
      console.log("Réponse reçue - Statut:", response.status);
      console.log("Réponse reçue - OK:", response.ok);
      console.log(
        "Réponse reçue - Headers:",
        JSON.stringify(Object.fromEntries([...response.headers.entries()]))
      );

      // Récupérer le texte de la réponse
      const responseText = await response.text();
      console.log("Réponse reçue - Texte:", responseText);

      // Vérifier si la requête a réussi
      if (!response.ok) {
        console.error("Erreur d'analyse d'image:", responseText);
        throw new Error(
          `Erreur d'analyse d'image ${response.status}: ${responseText}`
        );
      }

      // Convertir la réponse texte en JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error("Erreur lors du parsing JSON:", e);
        responseData = { insight: responseText };
      }

      // Retourner la réponse JSON
      return responseData;
    } catch (error) {
      console.error("Erreur lors de l'analyse de l'image:", error);
      throw error;
    }
  },

  // Version alternative qui prend directement un blob
  analyzeImageBlob: async (imageBlob: Blob) => {
    try {
      // Créer un objet FormData pour envoyer l'image
      const formData = new FormData();

      // Ajouter le blob au FormData
      formData.append("image", imageBlob, "image.jpg");

      const response = await fetch(
        getApiUrl(API_ENDPOINTS.ia.imageInsight, "image-insight"),
        {
          method: "POST",
          headers: {
            // Ne pas définir Content-Type pour FormData, il sera automatiquement défini
            Authorization: `Bearer ${getJwtToken()}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur d'analyse d'image ${response.status}: ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erreur d'analyse d'image:", error);
      throw error;
    }
  },

  askMuseumQuestion: async (
    question: string,
    artworkImageUri?: string,
    conversationId?: string
  ) => {
    try {
      // Validation des entrées
      if (!question || typeof question !== "string" || question.trim() === "") {
        throw new Error("La question ne peut pas être vide");
      }

      console.log("Envoi de question à l'IA:", question);
      console.log("Image associée:", artworkImageUri ? "Oui" : "Non");
      console.log("ID de conversation:", conversationId || "Aucun");

      // Préparer le payload selon le format EXACT attendu par le serveur
      // D'après le Swagger, le format attendu est:
      // {
      //   "artName": "string",
      //   "artist": "string",
      //   "responseTo": "string"
      // }

      // On va utiliser le champ 'responseTo' pour notre question
      const payload = {
        artName: "Non spécifié", // Valeur par défaut
        artist: "Non spécifié", // Valeur par défaut
        responseTo: question, // On met notre question ici
      };

      // Si un conversationId est disponible, on pourrait l'ajouter en tant que champ additionnel
      // même si ce n'est pas dans le schéma officiel
      if (conversationId && conversationId.trim() !== "") {
        (payload as any).conversationId = conversationId;
      }

      console.log("Payload formaté selon le schéma Swagger:", payload);

      // Si une image est fournie et que nous devons envoyer un FormData
      if (artworkImageUri) {
        console.log("Préparation du FormData avec image");

        const formData = new FormData();

        // Ajouter chaque champ du payload au FormData
        formData.append("artName", payload.artName);
        formData.append("artist", payload.artist);
        formData.append("responseTo", payload.responseTo);

        // Si un conversationId est fourni, l'ajouter également
        if (conversationId && conversationId.trim() !== "") {
          formData.append("conversationId", conversationId);
        }

        // Extraire le type de fichier à partir de l'URI
        const uriParts = artworkImageUri.split(".");
        const fileType = uriParts[uriParts.length - 1];

        // Ajouter l'image au FormData
        formData.append("artworkImage", {
          uri: artworkImageUri,
          name: `artwork.${fileType}`,
          type: `image/${fileType}`,
        } as any);

        console.log("FormData créé avec question et image");

        // Envoi de la requête
        const response = await fetch(getApiUrl(API_ENDPOINTS.ia.museum, "ia"), {
          method: "POST",
          headers: {
            // Ne pas définir Content-Type pour FormData
            Authorization: `Bearer ${getJwtToken()}`,
          },
          body: formData,
        });

        console.log("Statut de réponse (avec image):", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Erreur de question IA muséale:", errorText);
          throw new Error(
            `Erreur de question IA muséale ${response.status}: ${errorText}`
          );
        }

        const responseData = await response.json();
        return responseData;
      } else {
        // Sans image, envoi JSON standard
        console.log("Envoi de la requête JSON sans image");

        const response = await fetch(getApiUrl(API_ENDPOINTS.ia.museum, "ia"), {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });

        console.log("Statut de réponse (sans image):", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Erreur de question IA muséale:", errorText);
          throw new Error(
            `Erreur de question IA muséale ${response.status}: ${errorText}`
          );
        }

        const responseData = await response.json();
        return responseData;
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);

      // Retourner une réponse d'erreur formatée pour éviter de faire planter l'application
      return {
        error: true,
        message:
          error instanceof Error
            ? error.message
            : "Erreur inconnue lors de l'envoi du message",
        response:
          "Désolé, je n'ai pas pu traiter votre demande. Veuillez réessayer.",
      };
    }
  },
};

export const APIService = {
  auth: AuthService,
  conversation: ConversationService,
  ia: IAService,
  getAuthHeaders,
  setJwtToken,
  getJwtToken,
};

export default APIService;
