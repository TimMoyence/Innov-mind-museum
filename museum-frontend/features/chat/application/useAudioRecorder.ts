import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAudioRecorder as useExpoRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  createAudioPlayer,
} from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { isMaestroAudioFixtureEnabled, resolveMaestroAudioFixtureUri } from './maestroAudioFixture';

/**
 * Hook that manages audio recording and playback for chat voice messages.
 * Handles platform-specific logic for both web (MediaRecorder) and native (expo-audio).
 *
 * Test-only seam: when the `EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE` build flag is set
 * (Maestro E2E only — never in production), `startRecording`/`stopRecording`
 * bypass the live `expo-audio` / `MediaRecorder` path and return a bundled
 * pre-recorded clip so the STT → LLM → TTS round-trip is deterministic on a
 * simulator that has no real microphone. See `./maestroAudioFixture.ts`.
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

  // Native recorder from expo-audio
  const nativeRecorder = useExpoRecorder(RecordingPresets.HIGH_QUALITY);

  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webMediaStreamRef = useRef<MediaStream | null>(null);
  const webAudioChunksRef = useRef<BlobPart[]>([]);
  const webAudioObjectUrlRef = useRef<string | null>(null);
  const webAudioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const nativePlayerRef = useRef<AudioPlayer | null>(null);

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
      stopWebAudioStreamTracks();
      if (nativePlayerRef.current) {
        nativePlayerRef.current.remove();
        nativePlayerRef.current = null;
      }
      if (webAudioPlaybackRef.current) {
        webAudioPlaybackRef.current.pause();
        webAudioPlaybackRef.current = null;
      }
      revokeWebAudioObjectUrl();
    };
  }, [revokeWebAudioObjectUrl, stopWebAudioStreamTracks]);

  const startRecording = useCallback(async () => {
    // Test-only seam (Maestro E2E): never set in production. Flip the recording
    // state without driving any real capture device; the fixture URI is resolved
    // on stop. See ./maestroAudioFixture.ts.
    if (isMaestroAudioFixtureEnabled()) {
      revokeWebAudioObjectUrl();
      setRecordedAudioBlob(null);
      setRecordedAudioUri(null);
      setIsRecording(true);
      return;
    }

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

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('audio.permission_title'), t('audio.permission_body'));
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });

    await nativeRecorder.prepareToRecordAsync();
    nativeRecorder.record();
    setIsRecording(true);
  }, [nativeRecorder, revokeWebAudioObjectUrl, t]);

  const stopRecording = useCallback(async () => {
    // Test-only seam (Maestro E2E): resolve the bundled fixture clip to a
    // readable file:// URI instead of reading nativeRecorder.uri. The existing
    // upload path (appendRnFile → multipart → backend STT) then drives the real
    // round-trip deterministically. See ./maestroAudioFixture.ts.
    if (isMaestroAudioFixtureEnabled()) {
      const fixtureUri = await resolveMaestroAudioFixtureUri();
      setIsRecording(false);
      setRecordedAudioBlob(null);
      setRecordedAudioUri(fixtureUri);
      return;
    }

    if (Platform.OS === 'web') {
      const mediaRecorder = webMediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        return;
      }

      const blob = await new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const mimeType = mediaRecorder.mimeType.length ? mediaRecorder.mimeType : 'audio/webm';
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

    await nativeRecorder.stop();
    const uri = nativeRecorder.uri;
    setIsRecording(false);

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });

    if (uri) {
      setRecordedAudioBlob(null);
      setRecordedAudioUri(uri);
    }
  }, [nativeRecorder, revokeWebAudioObjectUrl, stopWebAudioStreamTracks]);

  const toggleRecording = useCallback(async () => {
    try {
      if (isRecordingRef.current) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch {
      setIsRecording(false);
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

      // Unload any previous playback before creating a new one
      if (nativePlayerRef.current) {
        nativePlayerRef.current.remove();
        nativePlayerRef.current = null;
      }

      const player = createAudioPlayer({ uri });
      nativePlayerRef.current = player;

      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setIsPlayingAudio(false);
          player.remove();
          nativePlayerRef.current = null;
        }
      });

      player.play();
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
