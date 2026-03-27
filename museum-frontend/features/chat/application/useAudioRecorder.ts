import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';

/**
 * Hook that manages audio recording and playback for chat voice messages.
 * Handles platform-specific logic for both web (MediaRecorder) and native (expo-av).
 */
export const useAudioRecorder = () => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const isRecordingRef = useRef(false);
  const recordedAudioUriRef = useRef<string | null>(null);
  const isPlayingAudioRef = useRef(false);
  /* eslint-disable react-hooks/refs -- intentional ref sync for stable callbacks */
  // Keep refs in sync with state
  isRecordingRef.current = isRecording;
  recordedAudioUriRef.current = recordedAudioUri;
  isPlayingAudioRef.current = isPlayingAudio;
  /* eslint-enable react-hooks/refs */

  const nativeRecordingRef = useRef<Audio.Recording | null>(null);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webMediaStreamRef = useRef<MediaStream | null>(null);
  const webAudioChunksRef = useRef<BlobPart[]>([]);
  const webAudioObjectUrlRef = useRef<string | null>(null);
  const webAudioPlaybackRef = useRef<HTMLAudioElement | null>(null);

  const revokeWebAudioObjectUrl = useCallback(() => {
    if (webAudioObjectUrlRef.current) {
      URL.revokeObjectURL(webAudioObjectUrlRef.current);
      webAudioObjectUrlRef.current = null;
    }
  }, []);

  const stopWebAudioStreamTracks = useCallback(() => {
    const stream = webMediaStreamRef.current;
    if (!stream) {
      return;
    }
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    webMediaStreamRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (nativeRecordingRef.current) {
        nativeRecordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
      if (webMediaRecorderRef.current && webMediaRecorderRef.current.state !== 'inactive') {
        webMediaRecorderRef.current.stop();
      }
      stopWebAudioStreamTracks();
      if (webAudioPlaybackRef.current) {
        webAudioPlaybackRef.current.pause();
        webAudioPlaybackRef.current = null;
      }
      revokeWebAudioObjectUrl();
    };
  }, [revokeWebAudioObjectUrl, stopWebAudioStreamTracks]);

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (
        typeof navigator === 'undefined' ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- web platform check
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        Alert.alert(t('audio.unavailable_title'), t('audio.unavailable_body'));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      webMediaStreamRef.current = stream;
      webAudioChunksRef.current = [];
      revokeWebAudioObjectUrl();
      setRecordedAudioBlob(null);
      setRecordedAudioUri(null);

      const mediaRecorder = new MediaRecorder(stream);
      webMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive data check
        if (event.data && event.data.size > 0) {
          webAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('audio.permission_title'), t('audio.permission_body'));
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording: nextRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );

    nativeRecordingRef.current = nextRecording;
    setIsRecording(true);
  }, [revokeWebAudioObjectUrl, t]);

  const stopRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      const mediaRecorder = webMediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        return;
      }

      const blob = await new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const mimeType =
            // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- complex condition
            mediaRecorder.mimeType && mediaRecorder.mimeType.length
              ? mediaRecorder.mimeType
              : 'audio/webm';
          resolve(new Blob(webAudioChunksRef.current, { type: mimeType }));
        };
        mediaRecorder.stop();
      });

      stopWebAudioStreamTracks();
      webMediaRecorderRef.current = null;
      setIsRecording(false);

      if (blob.size > 0) {
        revokeWebAudioObjectUrl();
        const objectUrl = URL.createObjectURL(blob);
        webAudioObjectUrlRef.current = objectUrl;
        setRecordedAudioBlob(blob);
        setRecordedAudioUri(objectUrl);
      }
      return;
    }

    const recording = nativeRecordingRef.current;
    if (!recording) {
      return;
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    nativeRecordingRef.current = null;
    setIsRecording(false);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    if (uri) {
      setRecordedAudioBlob(null);
      setRecordedAudioUri(uri);
    }
  }, [revokeWebAudioObjectUrl, stopWebAudioStreamTracks]);

  const toggleRecording = useCallback(async () => {
    try {
      if (isRecordingRef.current) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch {
      setIsRecording(false);
      nativeRecordingRef.current = null;
      Alert.alert(t('audio.error_title'), t('audio.error_body'));
    }
  }, [startRecording, stopRecording, t]);

  const playRecordedAudio = useCallback(async () => {
    const uri = recordedAudioUriRef.current;
    if (!uri || isPlayingAudioRef.current) {
      return;
    }

    setIsPlayingAudio(true);

    try {
      if (Platform.OS === 'web') {
        if (webAudioPlaybackRef.current) {
          webAudioPlaybackRef.current.pause();
          webAudioPlaybackRef.current = null;
        }

        const audioElement = new window.Audio(uri);
        webAudioPlaybackRef.current = audioElement;
        audioElement.onended = () => {
          setIsPlayingAudio(false);
          webAudioPlaybackRef.current = null;
        };
        audioElement.onerror = () => {
          setIsPlayingAudio(false);
          webAudioPlaybackRef.current = null;
        };
        await audioElement.play();
        return;
      }

      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          setIsPlayingAudio(false);
          sound.unloadAsync().catch(() => undefined);
          return;
        }

        if (status.didJustFinish) {
          setIsPlayingAudio(false);
          sound.unloadAsync().catch(() => undefined);
        }
      });
    } catch {
      setIsPlayingAudio(false);
      Alert.alert(t('audio.playback_error_title'), t('audio.playback_error_body'));
    }
  }, [t]);

  const clearRecordedAudio = useCallback(() => {
    setRecordedAudioBlob(null);
    if (webAudioPlaybackRef.current) {
      webAudioPlaybackRef.current.pause();
      webAudioPlaybackRef.current = null;
    }
    revokeWebAudioObjectUrl();
    setRecordedAudioUri(null);
  }, [revokeWebAudioObjectUrl]);

  return {
    isRecording,
    recordedAudioUri,
    recordedAudioBlob,
    isPlayingAudio,
    toggleRecording,
    playRecordedAudio,
    clearRecordedAudio,
  };
};
