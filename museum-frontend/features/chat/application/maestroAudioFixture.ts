import { Asset } from 'expo-asset';
import { readEnvString } from '@/shared/lib/env';

const MAESTRO_AUDIO_FIXTURE_MODULE =
  require('../../../assets/audio-fixtures/maestro-mona-lisa.m4a') as number;

export const isMaestroAudioFixtureEnabled = (): boolean =>
  readEnvString(process.env.EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE)?.toLowerCase() === 'true';

export const resolveMaestroAudioFixtureUri = async (): Promise<string> => {
  const asset = Asset.fromModule(MAESTRO_AUDIO_FIXTURE_MODULE);
  if (!asset.localUri) {
    await asset.downloadAsync();
  }
  return asset.localUri ?? asset.uri;
};
