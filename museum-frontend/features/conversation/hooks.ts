import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

import { conversationService } from '@/services/conversationService';
import { iaService } from '@/services/iaService';

import {
  type ChatMessage,
  type ConversationDTO,
  type ConversationListItem,
  ExperienceLevel,
  LEVELS,
} from './types';
import { normaliseConversation } from './lib';

const mapToChatMessage = (message: {
  id?: string;
  content?: string;
  text?: string;
  isFromAI?: boolean;
  role?: 'user' | 'assistant';
  timestamp?: string | number;
  createdAt?: string | number;
}): ChatMessage => ({
  id: message.id || Date.now().toString(),
  text: message.content || message.text || 'Message sans contenu',
  sender:
    message.isFromAI !== undefined
      ? message.isFromAI
        ? 'ai'
        : 'user'
      : message.role === 'assistant'
        ? 'ai'
        : 'user',
  timestamp: new Date(message.timestamp || message.createdAt || Date.now()),
});

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Une erreur inattendue est survenue.';
};

const extractConversationId = (
  data: unknown,
): string | undefined => {
  if (data && typeof data === 'object' && 'conversationId' in data) {
    const conversationId = (data as { conversationId?: unknown }).conversationId;
    if (typeof conversationId === 'string') {
      return conversationId;
    }
  }

  return undefined;
};

const extractResponseText = (data: unknown): string => {
  if (typeof data === 'string') {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return '';
  }

  const candidates = ['response', 'insight', 'message', 'answer'];

  for (const key of candidates) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim().length) {
      return value;
    }
  }

  return '';
};

export const useConversationScreen = () => {
  const [selectedLevel, setSelectedLevel] = useState<ExperienceLevel | ''>('');
  const [showCamera, setShowCamera] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('All');
  const [allDiscussions, setAllDiscussions] = useState<ConversationListItem[]>([]);
  const [discussions, setDiscussions] = useState<ConversationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  const levelOptions = useMemo(() => LEVELS, []);

  const normaliseAndStore = useCallback(
    (conversations: ConversationDTO[] = []) => {
      const normalised = conversations.map(normaliseConversation);
      setAllDiscussions(normalised);
      setDiscussions((current) => {
        if (!current.length || activeTab === 'All') {
          return normalised;
        }

        return normalised.filter((item) => item.tags.includes(activeTab));
      });
    },
    [activeTab],
  );

  const loadDiscussions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await conversationService.getAllConversations();
      normaliseAndStore(data ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setAllDiscussions([]);
      setDiscussions([]);
    } finally {
      setIsLoading(false);
    }
  }, [normaliseAndStore]);

  const loadConversation = useCallback(async () => {
    try {
      const conversations = await conversationService.getAllConversations();

      if (!conversations?.length) {
        setConversationId(null);
        setConversation([]);
        return;
      }

      const lastConversation = conversations[conversations.length - 1];
      const lastConvId = lastConversation.id;

      setConversationId(lastConvId);

      const conversationDetails =
        await conversationService.getConversation(lastConvId);

      if (conversationDetails?.messages?.length) {
        const formattedMessages = conversationDetails.messages.map(mapToChatMessage);
        setConversation(formattedMessages);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setConversation([]);
    }
  }, []);

  useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

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

  useEffect(() => {
    if (showAIChat) {
      loadConversation();
    }
  }, [loadConversation, showAIChat]);

  useEffect(() => {
    if (!conversation.length) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    return () => clearTimeout(timeout);
  }, [conversation]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const handleLevelSelect = useCallback((level: ExperienceLevel) => {
    setSelectedLevel(level);
  }, []);

  const openCamera = useCallback(() => {
    setShowCamera(true);
  }, []);

  const closeCamera = useCallback(() => {
    setShowCamera(false);
  }, []);

  const analyzeArtworkImage = useCallback(
    async (imageUri: string) => {
      setIsAILoading(true);

      try {
        const analysisResult = await iaService.analyzeImage(
          imageUri,
          conversationId ?? undefined,
        );

        const newConversationId =
          extractConversationId(analysisResult) ?? conversationId ?? undefined;

        if (newConversationId && newConversationId !== conversationId) {
          setConversationId(newConversationId);
        }

        const responseText = extractResponseText(analysisResult);

        if (responseText) {
          const aiMessage: ChatMessage = {
            id: Date.now().toString(),
            text: responseText,
            sender: 'ai',
            timestamp: new Date(),
          };

          setConversation((prev) => [...prev, aiMessage]);
        }
      } catch (analysisError) {
        setError(getErrorMessage(analysisError));
      } finally {
        setIsAILoading(false);
      }
    },
    [conversationId],
  );

  const handlePhotoCapture = useCallback(
    (uri: string) => {
      setPhoto(uri);
      closeCamera();

      if (uri) {
        analyzeArtworkImage(uri);
      }
    },
    [analyzeArtworkImage, closeCamera],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const messageText = text.trim();
      if (!messageText) {
        return;
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        text: messageText,
        sender: 'user',
        timestamp: new Date(),
      };

      setConversation((prev) => [...prev, userMessage]);
      setIsAILoading(true);

      try {
        const response = await iaService.askMuseumQuestion(
          messageText,
          photo ?? undefined,
          conversationId ?? undefined,
        );

        const newConversationId =
          extractConversationId(response) ?? conversationId ?? undefined;

        if (newConversationId && newConversationId !== conversationId) {
          setConversationId(newConversationId);
        }

        let responseText = extractResponseText(response);

        if (!responseText && response && typeof response === 'object') {
          responseText = JSON.stringify(response);
        }

        const aiMessage: ChatMessage = {
          id: `${Date.now().toString()}-ai`,
          text:
            responseText ||
            "Désolé, je n'ai pas pu traiter votre demande. Veuillez réessayer.",
          sender: 'ai',
          timestamp: new Date(),
        };

        setConversation((prev) => [...prev, aiMessage]);
      } catch (sendError) {
        setError(getErrorMessage(sendError));
      } finally {
        setIsAILoading(false);
      }
    },
    [conversationId, photo],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    levelOptions,
    selectedLevel,
    setSelectedLevel: handleLevelSelect,
    showCamera,
    openCamera,
    closeCamera,
    showAIChat,
    setShowAIChat,
    photo,
    setPhoto,
    activeTab,
    setActiveTab: handleTabChange,
    allDiscussions,
    discussions,
    refreshDiscussions: loadDiscussions,
    isLoading,
    conversation,
    scrollViewRef,
    isAILoading,
    conversationId,
    handlePhotoCapture,
    analyzeArtworkImage,
    sendMessage,
    error,
    clearError,
  };
};
