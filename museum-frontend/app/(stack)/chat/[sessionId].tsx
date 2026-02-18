import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useChatSession } from '@/features/chat/application/useChatSession';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';

export default function ChatSessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = useMemo(() => String(params.sessionId || ''), [params.sessionId]);
  const navigation = useNavigation();

  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { messages, isLoading, isSending, error, clearError, sendMessage, locale } =
    useChatSession(sessionId);

  const onPickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const onTakePicture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets.length) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const onSend = async () => {
    const nextText = text.trim();

    if (!nextText && !selectedImage) {
      return;
    }

    await sendMessage({ text: nextText || undefined, imageUri: selectedImage || undefined });
    setText('');
    setSelectedImage(null);
  };

  const onClose = () => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/conversations');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Chat Session</Text>
          <Text style={styles.subheader}>{sessionId}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons name='close' size={22} color='#0F172A' />
        </Pressable>
      </View>

      {error ? <ErrorNotice message={error} onDismiss={clearError} /> : null}

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size='large' color='#0F766E' />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'assistant' ? styles.assistantBubble : styles.userBubble,
              ]}
            >
              <Text
                style={
                  item.role === 'assistant' ? styles.assistantText : styles.userText
                }
              >
                {item.text}
              </Text>
              <Text style={styles.timestamp}>
                {new Date(item.createdAt).toLocaleTimeString(locale || undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        />
      )}

      {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.preview} /> : null}

      <View style={styles.attachRow}>
        <Pressable style={styles.attachButton} onPress={onPickImage}>
          <Text style={styles.attachText}>Gallery</Text>
        </Pressable>
        <Pressable style={styles.attachButton} onPress={onTakePicture}>
          <Text style={styles.attachText}>Camera</Text>
        </Pressable>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder='Ask about the artwork...'
          multiline
        />
        <Pressable style={styles.sendButton} onPress={onSend} disabled={isSending}>
          {isSending ? (
            <ActivityIndicator color='#FFFFFF' />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECFEFF',
    paddingTop: 52,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  header: {
    fontSize: 26,
    fontWeight: '700',
    color: '#115E59',
  },
  subheader: {
    marginTop: 4,
    color: '#0F766E',
    fontSize: 12,
    marginBottom: 12,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#99F6E4',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 16,
    gap: 8,
  },
  bubble: {
    borderRadius: 12,
    padding: 12,
    maxWidth: '85%',
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  userBubble: {
    backgroundColor: '#0F766E',
    alignSelf: 'flex-end',
  },
  assistantText: {
    color: '#0F172A',
  },
  userText: {
    color: '#FFFFFF',
  },
  timestamp: {
    marginTop: 6,
    fontSize: 11,
    color: '#64748B',
  },
  preview: {
    marginTop: 8,
    width: 92,
    height: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  attachRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#14B8A6',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#F0FDFA',
  },
  attachText: {
    color: '#0F766E',
    fontWeight: '600',
  },
  sendButton: {
    borderRadius: 10,
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
