import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { AudioPlayer } from 'expo-audio';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { getCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';

interface UseTextToSpeech {
  isPlaying: boolean;
  isLoading: boolean;
  activeMessageId: string | null;
  failedMessageId: string | null;
  skippedLowDataMessageId: string | null;
  togglePlayback: (messageId: string) => Promise<void>;
  stopPlayback: () => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

const TTS_CACHE_DIR_NAME = 'tts';

function getTtsCacheDir(): string | null {
  if (Platform.OS === 'web') return null;
  const base = FileSystem.cacheDirectory;
  if (!base) return null;
  return `${base}${TTS_CACHE_DIR_NAME}/`;
}

async function getCachedTtsUri(messageId: string): Promise<string | null> {
  const dir = getTtsCacheDir();
  if (!dir) return null;
  const filePath = `${dir}${messageId}.mp3`;
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists ? filePath : null;
  } catch {
    return null;
  }
}

async function writeTtsCache(messageId: string, base64: string): Promise<string | null> {
  const dir = getTtsCacheDir();
  if (!dir) return null;
  try {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const filePath = `${dir}${messageId}.mp3`;
    await FileSystem.writeAsStringAsync(filePath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return filePath;
  } catch {
    return null;
  }
}

export function useTextToSpeech(): UseTextToSpeech {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [skippedLowDataMessageId, setSkippedLowDataMessageId] = useState<string | null>(null);

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
      } catch {}
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
      if (activeMessageId === messageId) {
        stopPlayback();
        return;
      }

      cleanup();
      setFailedMessageId(null);
      setSkippedLowDataMessageId(null);

      setIsLoading(true);
      setActiveMessageId(messageId);

      try {
        const cachedUri = await getCachedTtsUri(messageId);

        let uri: string;
        if (cachedUri) {
          uri = cachedUri;
        } else {
          if (getCurrentDataMode() === 'low') {
            cleanup();
            setSkippedLowDataMessageId(messageId);
            return;
          }
          const audioBuffer = await chatApi.synthesizeSpeech(messageId);

          if (!audioBuffer) {
            cleanup();
            return;
          }

          const base64 = arrayBufferToBase64(audioBuffer);

          const cachePath = await writeTtsCache(messageId, base64);
          uri = cachePath ?? `data:audio/mpeg;base64,${base64}`;
        }

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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
    });
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isPlaying,
    isLoading,
    activeMessageId,
    failedMessageId,
    skippedLowDataMessageId,
    togglePlayback,
    stopPlayback,
  };
}
