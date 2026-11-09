import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';

export type DispatchChannel = 'text' | 'image' | 'audio';

export type ConsentableProvider = 'openai' | 'google';

export type EnvGetter = (name: 'LLM_PROVIDER') => string | undefined;

export interface ResolvedScope {
  provider: ConsentableProvider;
  scope: ConsentScope;
}

const defaultEnvGetter: EnvGetter = (name) => process.env[name];

export function resolveActiveProviderForScope(
  channel: DispatchChannel,
  env: EnvGetter = defaultEnvGetter,
): ResolvedScope {
  if (channel === 'audio') {
    return { provider: 'openai', scope: 'third_party_ai_audio_openai' };
  }

  const raw = (env('LLM_PROVIDER') ?? 'openai').toLowerCase();
  const provider: ConsentableProvider = raw === 'google' ? 'google' : 'openai';

  if (channel === 'text') {
    return {
      provider,
      scope: provider === 'google' ? 'third_party_ai_text_google' : 'third_party_ai_text_openai',
    };
  }
  return {
    provider,
    scope: provider === 'google' ? 'third_party_ai_image_google' : 'third_party_ai_image_openai',
  };
}
