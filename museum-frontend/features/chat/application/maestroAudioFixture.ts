/* eslint-disable @typescript-eslint/no-require-imports -- bundled asset require() is the project's established pattern (shared/ui/BrandMark.tsx, liquidTheme.ts); Metro statically resolves the literal path to a numeric asset-module id. */
import { Asset } from 'expo-asset';
import { readEnvString } from '@/shared/lib/env';

/**
 * Test-only audio fixture injection seam for the Maestro E2E suite.
 *
 * Why this exists — Maestro cannot drive a real microphone on a simulator /
 * emulator, so the STT → LLM → TTS round-trip in `audio-recording-flow.yaml`
 * has no deterministic input and its assertions had to be `optional`, leaving
 * the flow green even when STT/LLM/TTS are dead (see
 * `.maestro/fixtures/audio.md`). This seam lets the recorder return a BUNDLED
 * pre-recorded clip ("Who painted the Mona Lisa") instead of driving
 * `expo-audio`, so the round-trip runs deterministically end-to-end.
 *
 * STRICTLY test-gated — `isMaestroAudioFixtureEnabled()` is false unless the
 * `EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE` build-time env flag is explicitly set to
 * `true`. Production builds never set it, so there is zero prod behaviour
 * change: the live `expo-audio` path is untouched.
 *
 * The bundled fixture is a ~1.5s mono AAC M4A — the same container the native
 * recorder emits — so the existing upload path (`appendRnFile` → multipart →
 * backend STT `gpt-4o-mini-transcribe`) accepts it unchanged.
 *
 * @see museum-frontend/features/chat/application/useAudioRecorder.ts
 * @see museum-frontend/.maestro/fixtures/audio.md
 * @see museum-frontend/.maestro/audio-recording-flow.yaml
 */

// The require() path MUST stay a string literal — Metro statically resolves it
// at bundle time to a numeric asset-module id (`Asset.fromModule` accepts the
// number). A variable path would not be bundled.
const MAESTRO_AUDIO_FIXTURE_MODULE =
  require('../../../assets/audio-fixtures/maestro-mona-lisa.m4a') as number;

/**
 * True only when the Maestro audio-fixture seam is explicitly enabled at build
 * time. Reads via {@link readEnvString} to survive the CLAUDE.md gotcha where
 * `process.env.X` is typed `any` in CI vs `string` locally.
 */
export const isMaestroAudioFixtureEnabled = (): boolean =>
  readEnvString(process.env.EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE)?.toLowerCase() === 'true';

/**
 * Resolves the bundled fixture clip to a readable `file://` URI usable by the
 * existing multipart upload path. Mirrors the `Asset.fromModule(...).localUri`
 * idiom: `downloadAsync()` materialises the bundled asset to the local cache on
 * first call and is a no-op once cached.
 *
 * @returns a `file://` (or `content://`) URI for the fixture clip.
 */
export const resolveMaestroAudioFixtureUri = async (): Promise<string> => {
  const asset = Asset.fromModule(MAESTRO_AUDIO_FIXTURE_MODULE);
  if (!asset.localUri) {
    await asset.downloadAsync();
  }
  return asset.localUri ?? asset.uri;
};
