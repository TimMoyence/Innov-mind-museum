# Chat UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 UX issues in the Musaium chat experience: keyboard dismiss, session title, TTS error handling, and photo upload flow simplification.

**Architecture:** Frontend-heavy changes (React Native/Expo). One small backend change (session title initialization). All changes are in existing files — no new files created. One file deleted (ImagePreviewModal).

**Tech Stack:** React Native 0.83, Expo 55, TypeORM (backend), Jest + React Native Testing Library (tests)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `museum-frontend/app/(stack)/chat/[sessionId].tsx` | Add `Keyboard.dismiss()` on send, remove `ImagePreviewModal` usage, remove `pendingImage`/`confirmPendingImage`/`cancelPendingImage` |
| Modify | `museum-frontend/features/chat/ui/ChatHeader.tsx` | Remove subtitle row (UUID + museumName), remove `sessionId` and `museumName` props |
| Modify | `museum-frontend/features/chat/ui/ChatInput.tsx` | Add optional inline image thumbnail with × dismiss |
| Modify | `museum-frontend/features/chat/application/useImagePicker.ts` | Remove `pendingImage` state, set `selectedImage` directly after pick |
| Modify | `museum-frontend/features/chat/ui/MediaAttachmentPanel.tsx` | Remove image preview section (large preview + FloatingContextMenu) |
| Modify | `museum-frontend/features/chat/application/useTextToSpeech.ts` | Add `failedMessageId` state, expose it for error feedback |
| Modify | `museum-frontend/features/chat/ui/AssistantMetaActions.tsx` | Show disabled/error state on "Écouter" when TTS failed |
| Delete | `museum-frontend/features/chat/ui/ImagePreviewModal.tsx` | No longer needed — photo goes directly to inline preview |
| Modify | `museum-backend/src/modules/chat/adapters/secondary/chat.repository.typeorm.ts` | Set `title` from `museumName` on session creation |
| Modify (tests) | `museum-frontend/__tests__/components/ChatHeader.test.tsx` | Update for removed subtitle |
| Modify (tests) | `museum-frontend/__tests__/hooks/useImagePicker.test.ts` | Update for removed `pendingImage` flow |
| Modify (tests) | `museum-frontend/__tests__/hooks/useTextToSpeech.test.ts` | Add test for `failedMessageId` on error |
| Modify (tests) | `museum-backend/tests/unit/chat/chat-session.service.test.ts` | Add test for title = museumName |

---

## Task 1: Keyboard Dismiss on Send

**Files:**
- Modify: `museum-frontend/app/(stack)/chat/[sessionId].tsx:136-160`

- [ ] **Step 1: Add `Keyboard.dismiss()` in `onSend`**

In `museum-frontend/app/(stack)/chat/[sessionId].tsx`, find the `onSend` callback (line 136) and add `Keyboard.dismiss()` as the first action:

```typescript
  const onSend = useCallback(
    async (overrideText?: string) => {
      Keyboard.dismiss();
      const nextText = (overrideText ?? text).trim();
```

This is a one-line addition. `Keyboard` is already imported (line 4).

- [ ] **Step 2: Verify typecheck passes**

Run: `cd museum-frontend && npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add museum-frontend/app/\(stack\)/chat/\[sessionId\].tsx
git commit -m "fix(chat): dismiss keyboard on message send"
```

---

## Task 2: Session Title = Museum Name

**Files:**
- Modify: `museum-backend/src/modules/chat/adapters/secondary/chat.repository.typeorm.ts:70-83`
- Modify: `museum-frontend/features/chat/ui/ChatHeader.tsx`
- Modify: `museum-frontend/__tests__/components/ChatHeader.test.tsx`
- Modify: `museum-backend/tests/unit/chat/chat-session.service.test.ts`

- [ ] **Step 1: Backend — set `title` from `museumName`**

In `museum-backend/src/modules/chat/adapters/secondary/chat.repository.typeorm.ts`, find the `createSession` method (line 70) and add `title`:

```typescript
  async createSession(input: CreateSessionInput): Promise<ChatSession> {
    const session = this.sessionRepo.create({
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      locale: input.locale || null,
      museumMode: input.museumMode ?? false,
      user: input.userId ? ({ id: input.userId } as ChatSession['user']) : null,
      museumId: input.museumId ?? null,
      museumName: input.museumName ?? null,
      title: input.museumName ?? null,
      coordinates: input.coordinates ?? null,
      visitContext: input.visitContext ?? null,
    });

    return await this.sessionRepo.save(session);
  }
```

- [ ] **Step 2: Backend test — verify title is set from museumName**

In `museum-backend/tests/unit/chat/chat-session.service.test.ts`, add a test inside the `createSession` describe block:

```typescript
    it('initialises session title from museumName when provided', async () => {
      const repo = makeRepo();
      const museumRepo = makeMuseumRepo();
      const svc = new ChatSessionService({ repository: repo, museumRepository: museumRepo });

      await svc.createSession({
        userId: 42,
        locale: 'fr',
        museumMode: true,
        museumName: 'CAPC',
      });

      expect(repo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ museumName: 'CAPC' }),
      );
    });
```

Run: `cd museum-backend && pnpm test -- -t "initialises session title from museumName"`
Expected: PASS

- [ ] **Step 3: Backend typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: no errors

- [ ] **Step 4: Frontend — remove subtitle from ChatHeader**

In `museum-frontend/features/chat/ui/ChatHeader.tsx`:

**Remove `museumName` and `sessionId` from props interface** (lines 11-12):
```typescript
interface ChatHeaderProps {
  sessionTitle: string | null;
  expertiseLevel?: 'beginner' | 'intermediate' | 'expert';
  isClosing: boolean;
  onClose: () => void;
  onSummary?: () => void;
  audioDescriptionEnabled?: boolean;
  onToggleAudioDescription?: () => void;
}
```

**Remove `museumName` and `sessionId` from destructuring** (line 24-25):
```typescript
export function ChatHeader({
  sessionTitle,
  expertiseLevel,
  isClosing,
  onClose,
  onSummary,
  audioDescriptionEnabled,
  onToggleAudioDescription,
}: ChatHeaderProps) {
```

**Remove the subtitle View block** (lines 43-48). Replace the entire `headerContent` View with:
```typescript
          <Text style={[styles.header, { color: theme.textPrimary }]} numberOfLines={1}>
            {sessionTitle ?? t('chat.fallback_title')}
          </Text>
          {expertiseLevel ? <ExpertiseBadge level={expertiseLevel} /> : null}
```

Remove the `headerSubRow` and `subheader` styles from the StyleSheet.

- [ ] **Step 5: Update ChatHeader usage in `[sessionId].tsx`**

In `museum-frontend/app/(stack)/chat/[sessionId].tsx`, remove `museumName` and `sessionId` props from the `<ChatHeader>` call (lines 286-302):

```typescript
          <ChatHeader
            sessionTitle={sessionTitle}
            expertiseLevel={expertiseLevel}
            isClosing={isClosing}
            onClose={() => {
              void onClose();
            }}
            onSummary={() => {
              setShowSummary(true);
            }}
            audioDescriptionEnabled={effectiveAudioDesc}
            onToggleAudioDescription={() => {
              setSessionAudioOverride((prev) => !(prev ?? audioDescEnabled));
            }}
          />
```

- [ ] **Step 6: Update ChatHeader tests**

In `museum-frontend/__tests__/components/ChatHeader.test.tsx`, update `baseProps` to remove `museumName` and `sessionId`:

```typescript
  const baseProps = {
    sessionTitle: 'Art Session',
    isClosing: false,
    onClose: jest.fn(),
  };
```

**Remove** the test `'renders museum name'` and `'renders truncated sessionId when museumName is null'`.

Run: `cd museum-frontend && npm test`
Expected: all ChatHeader tests pass

- [ ] **Step 7: Typecheck frontend**

Run: `cd museum-frontend && npm run lint`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add museum-backend/src/modules/chat/adapters/secondary/chat.repository.typeorm.ts \
       museum-backend/tests/unit/chat/chat-session.service.test.ts \
       museum-frontend/features/chat/ui/ChatHeader.tsx \
       museum-frontend/app/\(stack\)/chat/\[sessionId\].tsx \
       museum-frontend/__tests__/components/ChatHeader.test.tsx
git commit -m "fix(chat): use museum name as session title, remove debug UUID subtitle"
```

---

## Task 3: TTS Error Handling

**Files:**
- Modify: `museum-frontend/features/chat/application/useTextToSpeech.ts:34-145`
- Modify: `museum-frontend/features/chat/ui/AssistantMetaActions.tsx`
- Modify: `museum-frontend/__tests__/hooks/useTextToSpeech.test.ts`

- [ ] **Step 1: Add `failedMessageId` state to `useTextToSpeech`**

In `museum-frontend/features/chat/application/useTextToSpeech.ts`:

Add `failedMessageId` to the interface (line 8):
```typescript
interface UseTextToSpeech {
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Whether TTS audio is loading from the server. */
  isLoading: boolean;
  /** The message ID whose audio is currently active (loading or playing). */
  activeMessageId: string | null;
  /** The message ID whose TTS request failed (shown as error state). */
  failedMessageId: string | null;
  /** Toggle playback for a message: plays if idle, stops if already active. */
  togglePlayback: (messageId: string) => Promise<void>;
  /** Stops any active playback and resets state. */
  stopPlayback: () => void;
}
```

Add state (after line 37):
```typescript
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
```

In the `togglePlayback` callback, clear failed state at start (after `cleanup()`):
```typescript
      // Stop any existing playback first
      cleanup();
      setFailedMessageId(null);
```

In the `catch` block (line 129), set the failed message ID:
```typescript
    } catch {
      const failedId = messageId;
      cleanup();
      setFailedMessageId(failedId);
    }
```

Note: we capture `messageId` before `cleanup()` because `cleanup()` resets `activeMessageId`.

Update the return (line 144):
```typescript
  return { isPlaying, isLoading, activeMessageId, failedMessageId, togglePlayback, stopPlayback };
```

- [ ] **Step 2: Update AssistantMetaActions to show error state**

In `museum-frontend/features/chat/ui/AssistantMetaActions.tsx`:

Add `ttsFailed` prop to the interface (line 9):
```typescript
interface AssistantMetaActionsProps {
  messageId: string;
  feedbackValue?: 'positive' | 'negative' | null;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
  ttsPlaying: boolean;
  ttsLoading: boolean;
  /** Whether TTS failed for this message (disables the listen button). */
  ttsFailed: boolean;
  onToggleTts?: (messageId: string) => Promise<void>;
  onReport: (messageId: string) => void;
}
```

Add `ttsFailed` to the destructuring.

Update the TTS button rendering (around line 77-101). When `ttsFailed` is true, show a disabled button with an error icon:

```typescript
      {onToggleTts ? (
        <Pressable
          style={[styles.actionButton, ttsFailed && styles.actionDisabled]}
          onPress={() => {
            if (ttsFailed) return;
            void Haptics.selectionAsync();
            void onToggleTts(messageId);
          }}
          hitSlop={8}
          disabled={ttsFailed}
          accessibilityRole="button"
          accessibilityLabel={
            ttsFailed
              ? t('chat.tts_unavailable')
              : ttsPlaying
                ? t('chat.listening')
                : t('chat.listen')
          }
        >
          {ttsLoading ? (
            <ActivityIndicator size="small" color={theme.timestamp} />
          ) : (
            <Ionicons
              name={
                ttsFailed
                  ? 'volume-mute-outline'
                  : ttsPlaying
                    ? 'pause-outline'
                    : 'volume-high-outline'
              }
              size={13}
              color={ttsFailed ? theme.error : theme.timestamp}
            />
          )}
          <Text
            style={[styles.actionLabel, { color: ttsFailed ? theme.error : theme.timestamp }]}
          >
            {ttsFailed
              ? t('chat.tts_unavailable')
              : ttsPlaying
                ? t('chat.listening')
                : t('chat.listen')}
          </Text>
        </Pressable>
      ) : null}
```

Add the `actionDisabled` style:
```typescript
  actionDisabled: {
    opacity: 0.5,
  },
```

- [ ] **Step 3: Wire `failedMessageId` through ChatMessageList**

Find where `AssistantMetaActions` receives `ttsPlaying` and `ttsLoading` — this is in the component that renders chat bubbles. The `failedMessageId` from `useTextToSpeech()` needs to flow down as `ttsFailed={failedMessageId === message.id}`.

Search for where `useTextToSpeech` is called in the chat screen or message list, and add `failedMessageId` to the flow. The pattern mirrors `activeMessageId`:
- Where `ttsPlaying={tts.activeMessageId === msg.id && tts.isPlaying}` exists
- Add `ttsFailed={tts.failedMessageId === msg.id}`

- [ ] **Step 4: Add i18n key for `chat.tts_unavailable`**

Find the i18n translation files and add:
- FR: `"tts_unavailable": "Audio indisponible"`
- EN: `"tts_unavailable": "Audio unavailable"`

- [ ] **Step 5: Update TTS test**

In `museum-frontend/__tests__/hooks/useTextToSpeech.test.ts`:

Update the existing test `'recovers from API errors silently'` (line 140) to also check `failedMessageId`:

```typescript
  it('sets failedMessageId on API error', async () => {
    mockSynthesizeSpeech.mockRejectedValue(new Error('501 TTS unavailable'));

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.failedMessageId).toBe('msg-1');
  });

  it('clears failedMessageId when starting new playback', async () => {
    mockSynthesizeSpeech
      .mockRejectedValueOnce(new Error('501'))
      .mockResolvedValueOnce(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    // First call fails
    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });
    expect(result.current.failedMessageId).toBe('msg-1');

    // Second call succeeds on different message
    await act(async () => {
      await result.current.togglePlayback('msg-2');
    });
    expect(result.current.failedMessageId).toBeNull();
    expect(result.current.isPlaying).toBe(true);
  });
```

Also update the `initialises with idle state` test:
```typescript
    expect(result.current.failedMessageId).toBeNull();
```

Run: `cd museum-frontend && npm test`
Expected: all TTS tests pass

- [ ] **Step 6: Typecheck frontend**

Run: `cd museum-frontend && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add museum-frontend/features/chat/application/useTextToSpeech.ts \
       museum-frontend/features/chat/ui/AssistantMetaActions.tsx \
       museum-frontend/__tests__/hooks/useTextToSpeech.test.ts
git commit -m "fix(chat): show TTS error state instead of silent failure"
```

---

## Task 4: Photo Upload — Inline Preview

**Files:**
- Modify: `museum-frontend/features/chat/application/useImagePicker.ts`
- Modify: `museum-frontend/features/chat/ui/ChatInput.tsx`
- Modify: `museum-frontend/features/chat/ui/MediaAttachmentPanel.tsx`
- Modify: `museum-frontend/app/(stack)/chat/[sessionId].tsx`
- Delete: `museum-frontend/features/chat/ui/ImagePreviewModal.tsx`
- Modify: `museum-frontend/__tests__/hooks/useImagePicker.test.ts`

- [ ] **Step 1: Simplify `useImagePicker` — remove `pendingImage`**

Rewrite `museum-frontend/features/chat/application/useImagePicker.ts`. Remove `pendingImage`, `confirmPendingImage`, `cancelPendingImage`. After picking, set `selectedImage` directly:

```typescript
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePickerLib from 'expo-image-picker';

import { optimizeImageForUpload } from './imageUploadOptimization';

/**
 * Hook that manages image selection state and handlers for chat attachments.
 * Supports gallery picking and native camera capture.
 */
export const useImagePicker = () => {
  const { t } = useTranslation();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const setOptimizedImage = useCallback(async (uri: string) => {
    try {
      const optimizedUri = await optimizeImageForUpload(uri);
      setSelectedImage(optimizedUri);
    } catch {
      setSelectedImage(uri);
    }
  }, []);

  const onPickImage = useCallback(async () => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- expo-image-picker returns string-typed status from permission APIs
    if (status !== 'granted') {
      Alert.alert(t('permissions.galleryTitle'), t('permissions.galleryMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.settings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }

    let result;
    try {
      result = await ImagePickerLib.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
    } catch {
      return;
    }

    if (!result.canceled && result.assets.length) {
      await setOptimizedImage(result.assets[0].uri);
    }
  }, [setOptimizedImage, t]);

  const onTakePicture = useCallback(async () => {
    const { status } = await ImagePickerLib.requestCameraPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- expo-image-picker returns string-typed status from permission APIs
    if (status !== 'granted') {
      Alert.alert(t('permissions.cameraTitle'), t('permissions.cameraMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.settings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }

    let result;
    try {
      result = await ImagePickerLib.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
    } catch {
      return;
    }

    if (!result.canceled && result.assets.length) {
      await setOptimizedImage(result.assets[0].uri);
    }
  }, [setOptimizedImage, t]);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
  }, []);

  return {
    selectedImage,
    onPickImage,
    onTakePicture,
    clearSelectedImage,
  };
};
```

- [ ] **Step 2: Add inline thumbnail to ChatInput**

Modify `museum-frontend/features/chat/ui/ChatInput.tsx` to accept an optional `imageUri` and `onClearImage` prop, and render a small thumbnail to the left of the text input:

```typescript
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
  disabled?: boolean;
  /** URI of the attached image to show as inline thumbnail. */
  imageUri?: string | null;
  /** Called when user taps the × on the thumbnail. */
  onClearImage?: () => void;
}

export const ChatInput = ({
  value,
  onChangeText,
  onSend,
  isSending,
  disabled = false,
  imageUri,
  onClearImage,
}: ChatInputProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <GlassCard style={styles.inputRow} intensity={56}>
      {imageUri ? (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: imageUri }} style={[styles.thumb, { borderColor: theme.inputBorder }]} />
          <Pressable
            style={[styles.thumbDismiss, { backgroundColor: theme.error }]}
            onPress={onClearImage}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('chat.remove_image')}
          >
            <Ionicons name="close" size={12} color="#fff" />
          </Pressable>
        </View>
      ) : null}
      <TextInput
        style={[
          styles.input,
          {
            borderColor: theme.inputBorder,
            backgroundColor: theme.inputBackground,
            color: theme.textPrimary,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('chatInput.placeholder')}
        placeholderTextColor={theme.textSecondary}
        multiline
        editable={!disabled}
        testID="chat-input"
        accessibilityLabel={t('a11y.chat.message_input')}
      />
      <Pressable
        style={[styles.sendButton, { backgroundColor: theme.primary }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSend();
        }}
        disabled={isSending || disabled}
        testID="send-button"
        accessibilityRole="button"
        accessibilityLabel={t('a11y.chat.send')}
        accessibilityHint={t('a11y.chat.send_hint')}
      >
        {isSending ? (
          <ActivityIndicator color={theme.primaryContrast} />
        ) : (
          <Ionicons name="send" size={20} color={theme.primaryContrast} />
        )}
      </Pressable>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
    padding: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    writingDirection: 'auto',
  },
  sendButton: {
    borderRadius: 999,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
  },
  thumbDismiss: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 3: Remove image preview from MediaAttachmentPanel**

In `museum-frontend/features/chat/ui/MediaAttachmentPanel.tsx`, remove the `selectedImage`, `onPickImage` (for replace), and `clearSelectedImage` props. Remove the image preview block (lines 43-70). Keep only audio preview and the attach row buttons.

Updated props interface:
```typescript
interface MediaAttachmentPanelProps {
  recordedAudioUri: string | null;
  isPlayingAudio: boolean;
  isRecording: boolean;
  playRecordedAudio: () => Promise<void>;
  clearMedia: () => void;
  onPickImage: () => void;
  onTakePicture: () => void;
  toggleRecording: () => Promise<void>;
}
```

Remove the `selectedImage` conditional block and `FloatingContextMenu` import. Remove `previewWrap`, `preview`, and `previewMenu` styles.

- [ ] **Step 4: Update `[sessionId].tsx` — wire new flow**

In `museum-frontend/app/(stack)/chat/[sessionId].tsx`:

**Update `useImagePicker` destructuring** (lines 101-109) — remove `pendingImage`, `confirmPendingImage`, `cancelPendingImage`:
```typescript
  const {
    selectedImage,
    onPickImage,
    onTakePicture,
    clearSelectedImage,
  } = useImagePicker();
```

**Remove `ImagePreviewModal` import** (line 32):
```typescript
// DELETE: import { ImagePreviewModal } from '@/features/chat/ui/ImagePreviewModal';
```

**Remove `ImagePreviewModal` JSX** (lines 354-358):
```typescript
// DELETE the entire <ImagePreviewModal ... /> block
```

**Update `MediaAttachmentPanel` props** (lines 332-343) — remove `selectedImage` and `clearSelectedImage`:
```typescript
          <MediaAttachmentPanel
            recordedAudioUri={recordedAudioUri}
            isPlayingAudio={isPlayingAudio}
            isRecording={isRecording}
            playRecordedAudio={playRecordedAudio}
            clearMedia={clearMedia}
            onPickImage={() => void onPickImage()}
            onTakePicture={() => void onTakePicture()}
            toggleRecording={toggleRecording}
          />
```

**Add `imageUri` and `onClearImage` to ChatInput** (lines 345-350):
```typescript
          <ChatInput
            value={text}
            onChangeText={setText}
            onSend={() => void onSend()}
            isSending={isSending || !consentResolved || showAiConsent}
            imageUri={selectedImage}
            onClearImage={clearSelectedImage}
          />
```

- [ ] **Step 5: Delete `ImagePreviewModal.tsx`**

```bash
rm museum-frontend/features/chat/ui/ImagePreviewModal.tsx
```

Check if `useImageManipulation` is used elsewhere. If not, it can stay (not hurting anything).

- [ ] **Step 6: Update `useImagePicker` tests**

Rewrite `museum-frontend/__tests__/hooks/useImagePicker.test.ts` to remove all `pendingImage`/`confirmPendingImage`/`cancelPendingImage` references. After picking, the image goes directly to `selectedImage`:

Replace the test `'onPickImage() requests permissions and sets pendingImage on success'`:
```typescript
  it('onPickImage() requests permissions and sets selectedImage on success', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg' }],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.onPickImage();
    });

    expect(mockOptimizeImageForUpload).toHaveBeenCalledWith('file://photo.jpg');
    expect(result.current.selectedImage).toBe('file://photo.jpg');
  });
```

Update `'initialises with null selectedImage and null pendingImage'`:
```typescript
  it('initialises with null selectedImage', () => {
    const { result } = renderHook(() => useImagePicker());
    expect(result.current.selectedImage).toBeNull();
  });
```

Update camera tests similarly — `pendingImage` becomes `selectedImage`.

**Remove** tests for `confirmPendingImage` and `cancelPendingImage` (they no longer exist).

Run: `cd museum-frontend && npm test`
Expected: all tests pass

- [ ] **Step 7: Typecheck**

Run: `cd museum-frontend && npm run lint`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add -u museum-frontend/
git commit -m "fix(chat): inline photo preview — remove modal, reduce to 2-click flow"
```

---

## Task 5: Run All Tests + Final Verification

- [ ] **Step 1: Backend tests**

Run: `cd museum-backend && pnpm test`
Expected: all tests pass

- [ ] **Step 2: Frontend tests**

Run: `cd museum-frontend && npm test`
Expected: all tests pass

- [ ] **Step 3: Backend typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: no errors

- [ ] **Step 4: Frontend typecheck**

Run: `cd museum-frontend && npm run lint`
Expected: no errors
