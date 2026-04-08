import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

import { chatApi } from '@/features/chat/infrastructure/chatApi';

interface UseTextToSpeech {
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Whether TTS audio is loading from the server. */
  isLoading: boolean;
  /** The message ID whose audio is currently active (loading or playing). */
  activeMessageId: string | null;
  /** The message ID whose TTS request failed (shown as error state on the button). */
  failedMessageId: string | null;
  /** Toggle playback for a message: plays if idle, stops if already active. */
  togglePlayback: (messageId: string) => Promise<void>;
  /** Stops any active playback and resets state. */
  stopPlayback: () => void;
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
 * Calls `chatApi.synthesizeSpeech(messageId)` and plays the returned MP3 via expo-audio.
 */
export function useTextToSpeech(): UseTextToSpeech {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);

  const nativePlayerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (Platform.OS === 'web') {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    } else if (nativePlayerRef.current) {
      try {
        nativePlayerRef.current.remove();
      } catch {
        /* already removed */
      }
      nativePlayerRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setActiveMessageId(null);
  }, []);

  const stopPlayback = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const togglePlayback = useCallback(
    async (messageId: string) => {
      // If same message is active, stop it
      if (activeMessageId === messageId) {
        stopPlayback();
        return;
      }

      // Stop any existing playback first
      cleanup();
      setFailedMessageId(null);

      setIsLoading(true);
      setActiveMessageId(messageId);

      try {
        const audioBuffer = await chatApi.synthesizeSpeech(messageId);

        // 204 / empty response
        if (!audioBuffer) {
          cleanup();
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

        // Native: use expo-audio createAudioPlayer
        const player = createAudioPlayer({ uri });
        nativePlayerRef.current = player;

        setIsLoading(false);
        setIsPlaying(true);

        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            setActiveMessageId(null);
            player.remove();
            nativePlayerRef.current = null;
          }
        });

        player.play();
      } catch {
        const failedId = messageId;
        cleanup();
        setFailedMessageId(failedId);
      }
    },
    [activeMessageId, stopPlayback, cleanup],
  );

  // Cleanup on unmount: stop playback and release audio resources
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { isPlaying, isLoading, activeMessageId, failedMessageId, togglePlayback, stopPlayback };
}
