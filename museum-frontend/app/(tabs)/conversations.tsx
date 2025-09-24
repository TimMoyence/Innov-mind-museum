import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
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

import { CustomCameraView } from '@/components/CameraView';
import { DiscussionItem } from '@/components/DiscussionItem';
import { LevelSelector } from '@/components/LevelSelector';
import { ChatInput } from '@/components/chatInput';
import { useConversationScreen } from '@/features/conversation/hooks';
import type {
  ChatMessage,
  ExperienceLevel,
} from '@/features/conversation/types';
import { mainStyles } from '../styles/mainStyles';

const MessageBubble = ({ message }: { message: ChatMessage }) => {
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

export default function ConversationsScreen() {
  const {
    levelOptions,
    selectedLevel,
    setSelectedLevel,
    showCamera,
    openCamera,
    closeCamera,
    showAIChat,
    setShowAIChat,
    activeTab,
    setActiveTab,
    discussions,
    isLoading,
    conversation,
    scrollViewRef,
    isAILoading,
    handlePhotoCapture,
    sendMessage,
    error,
    clearError,
  } = useConversationScreen();

  useEffect(() => {
    if (!error) {
      return;
    }

    Alert.alert('Erreur', error, [
      {
        text: 'OK',
        onPress: clearError,
      },
    ]);
  }, [error, clearError]);

  return (
    <SafeAreaView style={mainStyles.safeArea}>
      <StatusBar barStyle='dark-content' />

      <View style={mainStyles.headerContainer}>
        <View>
          <Text style={mainStyles.headerTitle}>Museum Insights</Text>
          <Text style={mainStyles.headerSubtitle}>
            Explore recent AI-powered conversations
          </Text>
        </View>
        <TouchableOpacity
          style={mainStyles.cameraButton}
          onPress={openCamera}
        >
          <Feather name='camera' size={20} color='#111' />
          <Text style={mainStyles.cameraButtonText}>AR Mode</Text>
        </TouchableOpacity>
      </View>

      <LevelSelector
        levels={Array.from(levelOptions)}
        selectedLevel={selectedLevel || ''}
        onSelectLevel={(level) => setSelectedLevel(level as ExperienceLevel)}
      />

      <View style={mainStyles.tabContainer}>
        {['All', 'AI Chat', 'Assistant', 'Image Insight'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              mainStyles.tabButton,
              activeTab === tab && mainStyles.tabButtonActive,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                mainStyles.tabButtonText,
                activeTab === tab && mainStyles.tabButtonTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={mainStyles.loaderContainer}>
          <ActivityIndicator size='large' color='#0066cc' />
        </View>
      ) : (
        <ScrollView style={mainStyles.discussionList}>
          {discussions.map((discussion) => (
            <DiscussionItem
              key={discussion.id}
              imageUrl={discussion.imageUrl}
              title={discussion.title}
              location={discussion.location}
              time={discussion.time}
              participants={discussion.participants}
              tags={discussion.tags}
            />
          ))}

          {!discussions.length && (
            <View style={mainStyles.emptyState}>
              <Image
                source={{
                  uri: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=60',
                }}
                style={mainStyles.emptyStateImage}
              />
              <Text style={mainStyles.emptyStateTitle}>No conversations yet</Text>
              <Text style={mainStyles.emptyStateSubtitle}>
                Start chatting with the AI to see your discussions here.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <View style={mainStyles.chatContainer}>
        <View style={mainStyles.chatHeader}>
          <View>
            <Text style={mainStyles.chatTitle}>AI Companion</Text>
            <Text style={mainStyles.chatSubtitle}>
              Ask questions about artworks or share your thoughts.
            </Text>
          </View>
          <TouchableOpacity
            style={mainStyles.chatToggleButton}
            onPress={() => setShowAIChat(!showAIChat)}
          >
            <Feather
              name={showAIChat ? 'chevron-down' : 'chevron-up'}
              size={20}
              color='#0066cc'
            />
          </TouchableOpacity>
        </View>

        {showAIChat && (
          <View style={mainStyles.chatContent}>
            <ScrollView ref={scrollViewRef} style={mainStyles.chatMessages}>
              {conversation.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {isAILoading && (
                <View style={mainStyles.loadingBubble}>
                  <ActivityIndicator size='small' color='#0066cc' />
                  <Text style={mainStyles.loadingBubbleText}>AI is typing...</Text>
                </View>
              )}
            </ScrollView>

            <ChatInput onSendMessage={sendMessage} />
          </View>
        )}
      </View>

      {showCamera && (
        <CustomCameraView
          onClose={closeCamera}
          onCapture={handlePhotoCapture}
        />
      )}
    </SafeAreaView>
  );
}
