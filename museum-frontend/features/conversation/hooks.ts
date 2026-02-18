import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

import { getErrorMessage } from '@/shared/lib/errors';
import {
  analyzeArtworkImage as analyzeArtworkImageUseCase,
  askMuseumQuestion as askMuseumQuestionUseCase,
  fetchAllConversations,
  fetchLatestConversationMessages,
} from './application/useCases';

import {
  type ChatMessage,
  type ConversationDTO,
  type ConversationListItem,
  ExperienceLevel,
  LEVELS,
} from './types';
import { normaliseConversation } from './lib';

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
      const data = await fetchAllConversations();
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
      const { conversationId: lastConvId, messages } =
        await fetchLatestConversationMessages();

      setConversationId(lastConvId);
      setConversation(messages);
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
        const { conversationId: newConversationId, responseText } =
          await analyzeArtworkImageUseCase(imageUri, conversationId ?? undefined);

        if (newConversationId && newConversationId !== conversationId) {
          setConversationId(newConversationId);
        }

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
        const { conversationId: newConversationId, responseText } =
          await askMuseumQuestionUseCase(
            messageText,
            photo ?? undefined,
            conversationId ?? undefined,
          );

        if (newConversationId && newConversationId !== conversationId) {
          setConversationId(newConversationId);
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
