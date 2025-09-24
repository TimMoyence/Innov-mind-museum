import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CustomCameraView } from '../../components/CameraView';
import { DiscussionItem } from '../../components/DiscussionItem';
import { LevelSelector } from '../../components/LevelSelector';
import { ChatInput } from '../../components/chatInput';
import APIService from '../../context/api';
import { mainStyles } from '../styles/mainStyles';

interface AIMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface BackendConversationMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt?: string;
  timestamp?: string;
}

interface BackendConversation {
  id: string;
  imageUrl?: string | null;
  createdAt?: string;
  messages?: BackendConversationMessage[];
  user?: {
    id?: string | number;
    firstname?: string;
  } | null;
}

interface Discussion {
  id: string;
  imageUrl: string;
  title: string;
  location: string;
  time: string;
  participants: number;
  tags: string[];
}

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const DEFAULT_DISCUSSION_IMAGE =
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=60';

const formatTimestamp = (value?: string | number | Date) => {
  if (!value) return 'Unk. date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unk. date';
  }

  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normaliseConversation = (conversation: BackendConversation): Discussion => {
  const messages = [...(conversation.messages ?? [])].sort((a, b) => {
    const aDate = new Date(a.createdAt ?? a.timestamp ?? 0).getTime();
    const bDate = new Date(b.createdAt ?? b.timestamp ?? 0).getTime();
    return aDate - bDate;
  });

  const lastMessage = messages[messages.length - 1];
  const userMessages = messages.filter((msg) => msg.role === 'user');
  const assistantMessages = messages.filter((msg) => msg.role === 'assistant');

  const baseTitle = lastMessage?.content ||
    assistantMessages[0]?.content ||
    'AI conversation';

  const title =
    baseTitle.length > 80 ? `${baseTitle.slice(0, 77)}...` : baseTitle;

  const imageUrl = conversation.imageUrl || DEFAULT_DISCUSSION_IMAGE;

  const createdAt =
    lastMessage?.createdAt ||
    lastMessage?.timestamp ||
    conversation.createdAt ||
    new Date().toISOString();

  const tags: string[] = ['AI Chat'];
  if (conversation.imageUrl) {
    tags.push('Image Insight');
  }
  if (assistantMessages.length) {
    tags.push('Assistant');
  }

  return {
    id: conversation.id,
    imageUrl,
    title,
    location: conversation.user?.firstname
      ? `Visitor: ${conversation.user.firstname}`
      : 'Visitor: Anonymous',
    time: formatTimestamp(createdAt),
    participants: Math.max(messages.length, 1),
    tags,
  };
};

// Composant pour afficher un message individuel
const MessageBubble = ({ message }: { message: AIMessage }) => {
  const isAI = message.sender === 'ai';

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
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
};

// Composant principal
export default function ConversationsScreen() {
  const [selectedLevel, setSelectedLevel] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('All');
  const [allDiscussions, setAllDiscussions] = useState<Discussion[]>([]);
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
  const loadDiscussions = async () => {
    setIsLoading(true);
    try {
      const data = await APIService.conversation.getAllConversations();
      const normalized = (data ?? []).map(normaliseConversation);
      setAllDiscussions(normalized);
      setDiscussions(normalized);
    } catch (error) {
      console.error('Error fetching discussions:', error);
      setAllDiscussions([]);
      setDiscussions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Essayer de récupérer une conversation existante quand on ouvre le chat
  const loadConversation = async () => {
    try {
      console.log('Tentative de chargement des conversations');

      const conversations = await APIService.conversation.getAllConversations();

      if (conversations && conversations.length > 0) {
        // Récupérer la dernière conversation
        const lastConversation = conversations[conversations.length - 1];
        const lastConvId = lastConversation.id;

        console.log('Dernière conversation trouvée:', lastConvId);
        setConversationId(lastConvId);

        // Récupérer les détails de cette conversation
        const conversationDetails =
          await APIService.conversation.getConversation(lastConvId);

        if (conversationDetails && conversationDetails.messages) {
          console.log('Messages trouvés dans la conversation');

          // Convertir les messages au format attendu par notre app
          const formattedMessages = conversationDetails.messages.map(
            (msg: {
              id?: string;
              content?: string;
              text?: string;
              isFromAI?: boolean;
              role?: 'user' | 'assistant';
              timestamp?: string | number;
              createdAt?: string | number;
            }) => ({
              id: msg.id || Date.now().toString(),
              text: msg.content || msg.text || 'Message sans contenu',
              sender:
                msg.isFromAI !== undefined
                  ? msg.isFromAI
                    ? 'ai'
                    : 'user'
                  : msg.role === 'assistant'
                    ? 'ai'
                    : 'user',
              timestamp: new Date(
                msg.timestamp || msg.createdAt || Date.now(),
              ),
            }),
          );

          setConversation(formattedMessages);
        }
      } else {
        console.log('Aucune conversation existante');
        // Réinitialiser les états
        setConversationId(null);
        setConversation([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la conversation:', error);
      Alert.alert(
        'Erreur',
        "Impossible de charger l'historique des conversations.",
      );
    }
  };

  // Charger les discussions au premier rendu
  useEffect(() => {
    loadDiscussions();
  }, []);

  useEffect(() => {
    if (activeTab === 'All') {
      setDiscussions(allDiscussions);
      return;
    }

    setDiscussions(
      allDiscussions.filter((discussion) =>
        discussion.tags.includes(activeTab),
      ),
    );
  }, [activeTab, allDiscussions]);

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

  const analyzeArtworkImage = async (imageUri: string) => {
    try {
      setIsAILoading(true);
      console.log("Analyse de l'image:", imageUri);

      const analysisResult = await APIService.ia.analyzeImage(
        imageUri,
        conversationId || undefined,
      );

      if (analysisResult) {
        console.log("Résultat d'analyse:", analysisResult);

        // Si nous recevons un nouvel ID de conversation, le stocker
        if (analysisResult.conversationId && !conversationId) {
          console.log(
            'Nouvelle conversation créée:',
            analysisResult.conversationId,
          );
          setConversationId(analysisResult.conversationId);
        }

        // Créer un message IA avec le résultat de l'analyse
        const aiMessage: AIMessage = {
          id: Date.now().toString(),
          text: analysisResult.insight || "Analyse de l'image réussie",
          sender: 'ai',
          timestamp: new Date(),
        };

        // Ajouter le message à la conversation
        setConversation((prev) => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error("Erreur lors de l'analyse de l'image:", error);
      Alert.alert(
        'Erreur',
        "Impossible d'analyser l'image. Veuillez réessayer.",
      );
    } finally {
      setIsAILoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Récupérer le message avant de le réinitialiser
    const messageText = text.trim();

    // Créer un message utilisateur
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      text: messageText,
      sender: 'user',
      timestamp: new Date(),
    };

    // Ajouter le message utilisateur à la conversation
    setConversation((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      console.log("Envoi de question à l'IA:", messageText);
      console.log('Photo associée:', photo ? 'Oui' : 'Non');
      console.log('ID de conversation:', conversationId || 'Aucun');

      // Utiliser la fonction mise à jour avec le conversationId si disponible
      const response = await APIService.ia.askMuseumQuestion(
        messageText,
        photo || undefined,
        conversationId || undefined,
      );

      console.log("Réponse complète de l'API:", response);

      // Si nous recevons un nouvel ID de conversation, le stocker
      if (response.conversationId && !conversationId) {
        console.log('Nouvelle conversation créée:', response.conversationId);
        setConversationId(response.conversationId);
      }

      // Extraire la partie pertinente de la réponse selon sa structure
      let responseText = '';

      if (response) {
        if (typeof response === 'string') {
          responseText = response;
        } else if (response.response) {
          responseText = response.response;
        } else if (response.answer) {
          responseText = response.answer;
        } else if (response.message) {
          responseText = response.message;
        } else if (response.insight) {
          responseText = response.insight;
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
        sender: 'ai',
        timestamp: new Date(),
      };

      // Ajouter la réponse de l'IA à la conversation
      setConversation((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      Alert.alert(
        'Erreur',
        "Impossible de communiquer avec l'IA. Veuillez vérifier votre connexion et réessayer.",
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
        <StatusBar barStyle='dark-content' />
        <View style={mainStyles.header}>
          <TouchableOpacity
            style={mainStyles.menuButton}
            onPress={() => setShowAIChat(false)}
          >
            <Feather name='arrow-left' size={24} color='#111' />
          </TouchableOpacity>

          <View style={mainStyles.logoHeaderContainer}>
            <Text style={mainStyles.logoHeader}>★ AI ASSISTANT ★</Text>
          </View>

          <TouchableOpacity style={mainStyles.searchButton}>
            <Feather name='info' size={24} color='#111' />
          </TouchableOpacity>
        </View>

        {photo && (
          <View style={mainStyles.chatImageContainer}>
            <Image
              source={{ uri: photo }}
              style={mainStyles.chatImage}
              resizeMode='cover'
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
                <Feather name='message-circle' size={48} color='#ddd' />
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
                <ActivityIndicator size='small' color='#0066cc' />
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
      <StatusBar barStyle='dark-content' />
      <View style={mainStyles.header}>
        <TouchableOpacity
          style={mainStyles.menuButton}
          onPress={() => router.back()}
        >
          <Feather name='arrow-left' size={24} color='#111' />
        </TouchableOpacity>

        <View style={mainStyles.logoHeaderContainer}>
          <Text style={mainStyles.logoHeader}>★ NOAVISIT ★</Text>
        </View>

        <TouchableOpacity style={mainStyles.searchButton}>
          <Feather name='search' size={24} color='#111' />
        </TouchableOpacity>
      </View>

      <View style={mainStyles.tabs}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={mainStyles.tabsContent}
        >
          {['All', 'AI Chat', 'Image Insight', 'Assistant'].map((tab) => (
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
                <Feather name='camera' size={24} color='#111' />
              </View>
            </View>
          </TouchableOpacity>
        )}

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
                <Feather name='message-circle' size={24} color='#111' />
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
              resizeMode='cover'
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
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size='large' color='#0000ff' />
              <Text style={{ marginTop: 10, color: '#666' }}>
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
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#666' }}>Aucune discussion trouvée</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
