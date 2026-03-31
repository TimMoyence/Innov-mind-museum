import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

import { chatApi } from '@/features/chat/infrastructure/chatApi';

interface UseTextToSpeech {
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Whether TTS audio is loading from the server. */
  isLoading: boolean;
  /** The message ID whose audio is currently active (loading or playing). */
  activeMessageId: string | null;
  /** Toggle playback for a message: plays if idle, stops if already active. */
  togglePlayback: (messageId: string) => Promise<void>;
  /** Stops any active playback and resets state. */
  stopPlayback: () => Promise<void>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Hook that manages TTS playback for assistant messages.
 * Calls `chatApi.synthesizeSpeech(messageId)` and plays the returned MP3 via expo-av.
 */
export function useTextToSpeech(): UseTextToSpeech {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    } else if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        /* already unloaded */
      }
      soundRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setActiveMessageId(null);
  }, []);

  const stopPlayback = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  const togglePlayback = useCallback(
    async (messageId: string) => {
      // If same message is active, stop it
      if (activeMessageId === messageId) {
        await stopPlayback();
        return;
      }

      // Stop any existing playback first
      await cleanup();

      setIsLoading(true);
      setActiveMessageId(messageId);

      try {
        const audioBuffer = await chatApi.synthesizeSpeech(messageId);

        // 204 / empty response
        if (!audioBuffer) {
          await cleanup();
          return;
        }

        const base64 = arrayBufferToBase64(audioBuffer);
        const uri = `data:audio/mpeg;base64,${base64}`;

        if (Platform.OS === 'web') {
          const audioElement = new window.Audio(uri);
          webAudioRef.current = audioElement;

          audioElement.onended = () => {
            setIsPlaying(false);
            setActiveMessageId(null);
            webAudioRef.current = null;
          };
          audioElement.onerror = () => {
            setIsPlaying(false);
            setActiveMessageId(null);
            webAudioRef.current = null;
          };

          setIsLoading(false);
          setIsPlaying(true);
          await audioElement.play();
          return;
        }

        // Native: use expo-av Audio.Sound
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;

        setIsLoading(false);
        setIsPlaying(true);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) {
            setIsPlaying(false);
            setActiveMessageId(null);
            sound.unloadAsync().catch(() => undefined);
            soundRef.current = null;
            return;
          }

          if (status.didJustFinish) {
            setIsPlaying(false);
            setActiveMessageId(null);
            sound.unloadAsync().catch(() => undefined);
            soundRef.current = null;
          }
        });
      } catch {
        // 501 (TTS unavailable) or network error — silently reset
        await cleanup();
      }
    },
    [activeMessageId, stopPlayback, cleanup],
  );

  return { isPlaying, isLoading, activeMessageId, togglePlayback, stopPlayback };
}
