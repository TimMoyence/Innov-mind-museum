import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LevelSelector } from "../../components/LevelSelector";
import { DiscussionItem } from "../../components/DiscussionItem";
import { ChatInput } from "../../components/chatInput";
import { mainStyles } from "../styles/mainStyles";
import { CustomCameraView } from "../../components/CameraView";

interface Discussion {
  id: string;
  imageUrl: string;
  title: string;
  location: string;
  time: string;
  participants: number;
  tags: string[];
}

interface AIMessage {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
}

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

// Exemple de données fictives pour le développement
const MOCK_DISCUSSIONS = [
  {
    id: "1",
    imageUrl:
      "https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&w=500",
    title: "The Starry Night - Van Gogh",
    location: "Manhattan, NYC",
    time: "Mon-Fri (10am-8pm)",
    participants: 5,
    tags: ["Painting", "Artwork"],
  },
  {
    id: "2",
    imageUrl:
      "https://images.unsplash.com/photo-1423742774270-6884aac775fa?auto=format&fit=crop&w=500",
    title: "Mona Lisa - Da Vinci",
    location: "Paris, France",
    time: "Wed-Sun (9am-7pm)",
    participants: 3,
    tags: ["Exhibition"],
  },
  {
    id: "3",
    imageUrl:
      "https://images.unsplash.com/photo-1562522730-7c98d13c6690?q=80&w=2940??auto=format&fit=crop&w=500",
    title: "David - Michelangelo",
    location: "Florence, Italy",
    time: "Tue-Sun (10am-6pm)",
    participants: 7,
    tags: ["Sculpture", "Exhibition"],
  },
];

// Fonction qui simule un appel API pour récupérer les discussions
const fetchDiscussions = async (
  filter?: string
): Promise<typeof MOCK_DISCUSSIONS> => {
  // Simulation d'un délai réseau
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (!filter || filter === "All") {
    return MOCK_DISCUSSIONS;
  }

  return MOCK_DISCUSSIONS.filter((discussion) =>
    discussion.tags.some((tag) => tag === filter)
  );
};

// Service pour interagir avec l'API selon le Swagger
const APIService = {
  // URL de base de l'API (selon votre indication : localhost:3000)
  BASE_URL: "http://localhost:3000",

  // Poser une question à l'IA muséale (endpoint /api/v1/ia/museum)
  askMuseumQuestion: async (
    question: string,
    artworkImageUrl?: string
  ): Promise<any> => {
    try {
      const endpoint = "/api/v1/ia/museum";
      const url = `${APIService.BASE_URL}${endpoint}`;

      console.log(`Envoi d'une question à ${url}:`, {
        question,
        artworkImageUrl,
      });

      const payload: any = { question };
      if (artworkImageUrl) {
        payload.artworkImageUrl = artworkImageUrl;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Remarque: Token à ajouter si nécessaire pour l'authentification
          // 'Authorization': 'Bearer YOUR_TOKEN'
        },
        body: JSON.stringify(payload),
      });

      console.log("Statut de réponse:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Réponse API:", responseData);

      return responseData;
    } catch (error) {
      console.error(
        "Erreur lors de la communication avec l'API IA Museum:",
        error
      );
      throw error;
    }
  },

  // Récupérer une conversation spécifique (endpoint /api/v1/conversation/{conversationId})
  getConversation: async (conversationId: string): Promise<any> => {
    try {
      const endpoint = `/api/v1/conversation/${conversationId}`;
      const url = `${APIService.BASE_URL}${endpoint}`;

      console.log(`Récupération de la conversation ${conversationId} à ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          // Remarque: Token à ajouter si nécessaire pour l'authentification
          // 'Authorization': 'Bearer YOUR_TOKEN'
        },
      });

      console.log("Statut de réponse:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Conversation récupérée:", responseData);

      return responseData;
    } catch (error) {
      console.error(
        "Erreur lors de la récupération de la conversation:",
        error
      );
      throw error;
    }
  },

  // Récupérer toutes les conversations (endpoint /api/v1/conversation/all)
  getAllConversations: async (): Promise<any[]> => {
    try {
      const endpoint = "/api/v1/conversation/all";
      const url = `${APIService.BASE_URL}${endpoint}`;

      console.log(`Récupération de toutes les conversations à ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          // Remarque: Token à ajouter si nécessaire pour l'authentification
          // 'Authorization': 'Bearer YOUR_TOKEN'
        },
      });

      console.log("Statut de réponse:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Conversations récupérées:", responseData);

      return responseData;
    } catch (error) {
      console.error("Erreur lors de la récupération des conversations:", error);
      return [];
    }
  },

  // Récupérer les conversations d'un utilisateur (endpoint /api/v1/conversation/all/{userId})
  getUserConversations: async (userId: string): Promise<any[]> => {
    try {
      const endpoint = `/api/v1/conversation/all/${userId}`;
      const url = `${APIService.BASE_URL}${endpoint}`;

      console.log(
        `Récupération des conversations de l'utilisateur ${userId} à ${url}`
      );

      const response = await fetch(url, {
        method: "GET",
        headers: {
          // Remarque: Token à ajouter si nécessaire pour l'authentification
          // 'Authorization': 'Bearer YOUR_TOKEN'
        },
      });

      console.log("Statut de réponse:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Conversations de l'utilisateur récupérées:", responseData);

      return responseData;
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des conversations de l'utilisateur:",
        error
      );
      return [];
    }
  },

  // Analyser une image (endpoint /api/v1/image-insight)
  analyzeImage: async (imageUrl: string): Promise<any> => {
    try {
      const endpoint = "/api/v1/image-insight";
      const url = `${APIService.BASE_URL}${endpoint}`;

      console.log(`Analyse d'image à ${url}:`, { imageUrl });

      const payload = { imageUrl };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Remarque: Token à ajouter si nécessaire pour l'authentification
          // 'Authorization': 'Bearer YOUR_TOKEN'
        },
        body: JSON.stringify(payload),
      });

      console.log("Statut de réponse:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Résultat de l'analyse d'image:", responseData);

      return responseData;
    } catch (error) {
      console.error("Erreur lors de l'analyse de l'image:", error);
      throw error;
    }
  },
};

// Composant pour afficher un message individuel
const MessageBubble = ({ message }: { message: AIMessage }) => {
  const isAI = message.sender === "ai";

  return (
    <View
      style={[
        mainStyles.messageBubble,
        isAI ? mainStyles.aiMessageBubble : mainStyles.userMessageBubble,
      ]}
    >
      <Text
        style={[
          mainStyles.messageText,
          isAI ? mainStyles.aiMessageText : mainStyles.userMessageText,
        ]}
      >
        {message.text}
      </Text>
      <Text style={mainStyles.messageTimestamp}>
        {message.timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
};

// Composant principal
export default function ConversationsScreen() {
  const [selectedLevel, setSelectedLevel] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("All");
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // États pour le chat IA
  const [conversation, setConversation] = useState<AIMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);

  // ID de conversation pour le stockage
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Référence pour le défilement automatique
  const scrollViewRef = useRef<ScrollView>(null);

  // Fonction pour charger les discussions
  const loadDiscussions = async (filter?: string) => {
    setIsLoading(true);
    try {
      const data = await fetchDiscussions(filter);
      setDiscussions(data);
    } catch (error) {
      console.error("Error fetching discussions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Essayer de récupérer une conversation existante quand on ouvre le chat
  const loadConversation = async () => {
    try {
      console.log("Tentative de chargement des conversations");

      const conversations = await APIService.getAllConversations();

      if (conversations && conversations.length > 0) {
        // Récupérer la dernière conversation
        const lastConversation = conversations[conversations.length - 1];
        const lastConvId = lastConversation.id;

        console.log("Dernière conversation trouvée:", lastConvId);
        setConversationId(lastConvId);

        // Récupérer les détails de cette conversation
        const conversationDetails = await APIService.getConversation(
          lastConvId
        );

        if (conversationDetails && conversationDetails.messages) {
          console.log("Messages trouvés dans la conversation");

          // Convertir les messages au format attendu par notre app
          const formattedMessages = conversationDetails.messages.map(
            (msg: {
              id?: string;
              content?: string;
              text?: string;
              isFromAI: boolean;
              timestamp?: string | number;
            }) => ({
              id: msg.id || Date.now().toString(),
              text: msg.content || msg.text || "Message sans contenu",
              sender: msg.isFromAI ? "ai" : "user",
              timestamp: new Date(msg.timestamp || Date.now()),
            })
          );

          setConversation(formattedMessages);
        }
      } else {
        console.log("Aucune conversation existante");
        // Réinitialiser les états
        setConversationId(null);
        setConversation([]);
      }
    } catch (error) {
      console.error("Erreur lors du chargement de la conversation:", error);
      Alert.alert(
        "Erreur",
        "Impossible de charger l'historique des conversations."
      );
    }
  };

  // Charger les discussions au premier rendu
  useEffect(() => {
    loadDiscussions();
  }, []);

  // Charger la conversation quand on ouvre le chat
  useEffect(() => {
    if (showAIChat) {
      loadConversation();
    }
  }, [showAIChat]);

  // Faire défiler vers le bas quand de nouveaux messages sont ajoutés
  useEffect(() => {
    if (scrollViewRef.current && conversation.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [conversation]);

  // Charger les discussions lorsque l'onglet change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    loadDiscussions(tab);
  };

  const handleLevelSelect = (level: string) => {
    setSelectedLevel(level);
  };

  const takePicture = () => {
    setShowCamera(true);
  };

  const handlePhotoCapture = (uri: string) => {
    setPhoto(uri);
    setShowCamera(false);

    // Optionnel: analyser automatiquement l'image capturée
    if (uri) {
      analyzeArtworkImage(uri);
    }
  };

  // Analyser une image d'œuvre d'art
  const analyzeArtworkImage = async (imageUrl: string) => {
    try {
      setIsAILoading(true);
      const analysisResult = await APIService.analyzeImage(imageUrl);

      if (analysisResult) {
        // Créer un message IA avec le résultat de l'analyse
        const aiMessage: AIMessage = {
          id: Date.now().toString(),
          text: analysisResult.insight || "Analyse de l'image réussie",
          sender: "ai",
          timestamp: new Date(),
        };

        // Ajouter le message à la conversation
        setConversation((prev) => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error("Erreur lors de l'analyse de l'image:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  // Fonction pour envoyer un message à l'IA
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Récupérer le message avant de le réinitialiser
    const messageText = text.trim();

    // Créer un message utilisateur
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      text: messageText,
      sender: "user",
      timestamp: new Date(),
    };

    // Ajouter le message utilisateur à la conversation
    setConversation((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      console.log("Envoi de question à l'IA:", messageText);

      // Appel à l'API exactement selon le swagger
      const response = await APIService.askMuseumQuestion(
        messageText,
        photo || undefined
      );

      console.log("Réponse complète de l'API:", response);

      // Extraire la partie pertinente de la réponse selon sa structure
      let responseText = "";

      if (response) {
        if (typeof response === "string") {
          responseText = response;
        } else if (response.response) {
          responseText = response.response;
        } else if (response.answer) {
          responseText = response.answer;
        } else if (response.message) {
          responseText = response.message;
        } else {
          responseText = JSON.stringify(response);
        }
      } else {
        responseText = "Aucune réponse reçue de l'API";
      }

      // Créer un message IA avec la réponse
      const aiMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: "ai",
        timestamp: new Date(),
      };

      // Ajouter la réponse de l'IA à la conversation
      setConversation((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      Alert.alert(
        "Erreur",
        "Impossible de communiquer avec l'IA. Veuillez vérifier votre connexion et réessayer."
      );
    } finally {
      setIsAILoading(false);
    }
  };

  // Ouvrir le chat IA
  const openAIChat = () => {
    setShowAIChat(true);
  };

  // Camera mode screen
  if (showCamera) {
    return (
      <CustomCameraView
        onClose={() => setShowCamera(false)}
        onCapture={handlePhotoCapture}
      />
    );
  }

  // AI Chat mode screen
  if (showAIChat) {
    return (
      <SafeAreaView style={mainStyles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={mainStyles.header}>
          <TouchableOpacity
            style={mainStyles.menuButton}
            onPress={() => setShowAIChat(false)}
          >
            <Feather name="arrow-left" size={24} color="#111" />
          </TouchableOpacity>

          <View style={mainStyles.logoHeaderContainer}>
            <Text style={mainStyles.logoHeader}>★ AI ASSISTANT ★</Text>
          </View>

          <TouchableOpacity style={mainStyles.searchButton}>
            <Feather name="info" size={24} color="#111" />
          </TouchableOpacity>
        </View>

        {photo && (
          <View style={mainStyles.chatImageContainer}>
            <Image
              source={{ uri: photo }}
              style={mainStyles.chatImage}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={mainStyles.changeImageButton}
              onPress={takePicture}
            >
              <Text style={mainStyles.changeImageText}>Change Image</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <ScrollView
            style={mainStyles.conversationContainer}
            contentContainerStyle={[
              mainStyles.conversationContent,
              { paddingBottom: 120 },
            ]}
            ref={scrollViewRef}
          >
            {conversation.length === 0 ? (
              <View style={mainStyles.emptyConversation}>
                <Feather name="message-circle" size={48} color="#ddd" />
                <Text style={mainStyles.emptyConversationText}>
                  Commencez à poser des questions sur l'art ou les œuvres que
                  vous voyez !
                </Text>
              </View>
            ) : (
              conversation.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}

            {isAILoading && (
              <View style={mainStyles.aiTypingIndicator}>
                <ActivityIndicator size="small" color="#0066cc" />
                <Text style={mainStyles.aiTypingText}>L'IA réfléchit...</Text>
              </View>
            )}
          </ScrollView>

          {/* Utilisation du composant ChatInput */}
          <ChatInput onSendMessage={sendMessage} />
        </View>

        {/* Ajouter un espace supplémentaire en bas pour éviter que le menu ne cache le contenu */}
        <View style={{ height: 65 }} />
      </SafeAreaView>
    );
  }

  // Main screen
  return (
    <SafeAreaView style={mainStyles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={mainStyles.header}>
        <TouchableOpacity
          style={mainStyles.menuButton}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={24} color="#111" />
        </TouchableOpacity>

        <View style={mainStyles.logoHeaderContainer}>
          <Text style={mainStyles.logoHeader}>★ NOAVISIT ★</Text>
        </View>

        <TouchableOpacity style={mainStyles.searchButton}>
          <Feather name="search" size={24} color="#111" />
        </TouchableOpacity>
      </View>

      <View style={mainStyles.tabs}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={mainStyles.tabsContent}
        >
          {["All", "Painting", "Sculpture", "Exhibition"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                mainStyles.tabButton,
                activeTab === tab && mainStyles.activeTabButton,
              ]}
              onPress={() => handleTabChange(tab)}
            >
              <Text
                style={[
                  mainStyles.tabText,
                  activeTab === tab && mainStyles.activeTabText,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={mainStyles.content}
        contentContainerStyle={mainStyles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Expertise Level Selection */}
        <View style={mainStyles.sectionContainer}>
          <View style={mainStyles.sectionHeader}>
            <Text style={mainStyles.sectionTitle}>Select Your Level</Text>
          </View>

          <LevelSelector
            levels={LEVELS}
            selectedLevel={selectedLevel}
            onSelectLevel={handleLevelSelect}
          />
        </View>

        {/* Camera Option */}
        {selectedLevel && (
          <TouchableOpacity
            style={mainStyles.cameraOption}
            onPress={takePicture}
            activeOpacity={0.9}
          >
            <View style={mainStyles.cameraOptionContent}>
              <View style={mainStyles.cameraOptionTextContainer}>
                <Text style={mainStyles.cameraOptionTitle}>Artwork Camera</Text>
                <Text style={mainStyles.cameraOptionDescription}>
                  Capture and discuss art pieces
                </Text>
                <View style={mainStyles.cameraOptionMeta}>
                  <View style={mainStyles.cameraOptionTag}>
                    <Text style={mainStyles.cameraOptionTagText}>AR Mode</Text>
                  </View>
                  <View style={mainStyles.cameraOptionBadge}>
                    <Text style={mainStyles.cameraOptionBadgeText}>
                      {selectedLevel}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={mainStyles.cameraOptionIcon}>
                <Feather name="camera" size={24} color="#111" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* AI Chat Option */}
        {selectedLevel && (
          <TouchableOpacity
            style={[mainStyles.cameraOption, mainStyles.aiChatOption]}
            onPress={openAIChat}
            activeOpacity={0.9}
          >
            <View style={mainStyles.cameraOptionContent}>
              <View style={mainStyles.cameraOptionTextContainer}>
                <Text style={mainStyles.cameraOptionTitle}>
                  Art Assistant AI
                </Text>
                <Text style={mainStyles.cameraOptionDescription}>
                  Ask questions about art and exhibitions
                </Text>
                <View style={mainStyles.cameraOptionMeta}>
                  <View style={[mainStyles.cameraOptionTag, mainStyles.aiTag]}>
                    <Text style={mainStyles.cameraOptionTagText}>AI Mode</Text>
                  </View>
                  <View style={mainStyles.cameraOptionBadge}>
                    <Text style={mainStyles.cameraOptionBadgeText}>
                      {selectedLevel}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[mainStyles.cameraOptionIcon, mainStyles.aiIcon]}>
                <Feather name="message-circle" size={24} color="#111" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Photo Preview */}
        {photo && (
          <View style={mainStyles.photoPreviewContainer}>
            <View style={mainStyles.photoHeader}>
              <Text style={mainStyles.photoTitle}>Your Artwork</Text>
              <Text style={mainStyles.photoSubtitle}>
                Selected Level: {selectedLevel}
              </Text>
            </View>

            <Image
              source={{ uri: photo }}
              style={mainStyles.photoImage}
              resizeMode="cover"
            />

            <View style={mainStyles.photoStats}>
              <View style={mainStyles.photoStatItem}>
                <Text style={mainStyles.photoStatNumber}>0</Text>
                <Text style={mainStyles.photoStatLabel}>Comments</Text>
              </View>
              <View style={mainStyles.photoStatItem}>
                <Text style={mainStyles.photoStatNumber}>0</Text>
                <Text style={mainStyles.photoStatLabel}>Views</Text>
              </View>
            </View>
          </View>
        )}

        {/* Discussions */}
        <View style={mainStyles.sectionContainer}>
          <View style={mainStyles.sectionHeader}>
            <Text style={mainStyles.sectionTitle}>Recent Discussions</Text>
            <TouchableOpacity style={mainStyles.seeAllButton}>
              <Text style={mainStyles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={{ marginTop: 10, color: "#666" }}>
                Chargement des discussions...
              </Text>
            </View>
          ) : discussions.length > 0 ? (
            discussions.map((discussion, index) => (
              <DiscussionItem
                key={discussion.id}
                imageUrl={discussion.imageUrl}
                title={discussion.title}
                location={discussion.location}
                time={discussion.time}
                participants={discussion.participants}
                tags={discussion.tags}
              />
            ))
          ) : (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ color: "#666" }}>Aucune discussion trouvée</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
