import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';

/**
 * Dispatch channel feeding into a third-party AI provider. Each channel maps to
 * a `third_party_ai_<channel>_<provider>` consent scope (D6).
 */
export type DispatchChannel = 'text' | 'image' | 'audio';

/**
 * Subset of `LlmProvider` that is currently behind one of the 8 granular
 * `third_party_ai_*` consent scopes (`userConsent.entity.ts:24-37`). DeepSeek
 * is on the recipients list but has no scope variant yet (spec §8 Q3 default).
 * Unknown / unsupported provider strings fall back to `openai` (D6 + parity
 * with `env-resolvers.ts:121-124`).
 */
export type ConsentableProvider = 'openai' | 'google';

/**
 * Closure that reads an env var. Injectable for testability — production
 * call sites pass `(name) => process.env[name]`.
 */
export type EnvGetter = (name: 'LLM_PROVIDER') => string | undefined;

export interface ResolvedScope {
  provider: ConsentableProvider;
  scope: ConsentScope;
}

const defaultEnvGetter: EnvGetter = (name) => process.env[name];

/**
 * Resolves a {@link DispatchChannel} to the currently-active third-party
 * provider plus its matching `third_party_ai_<channel>_<provider>` scope.
 *
 * Audio dispatch is hard-pinned to `openai` (`chat-module.ts:3,:7` —
 * `OpenAiAudioTranscriber`) regardless of `LLM_PROVIDER`, because the chat
 * LLM provider switch does NOT swap the STT backend (design §3 R4, §9 D6).
 *
 * Unknown / DeepSeek `LLM_PROVIDER` values fall back to `openai` so the gate
 * stays safe — DeepSeek is deferred per Q3, never coining a new scope here.
 *
 * @param channel — message dispatch channel (text/image = chat LLM,
 *   audio = STT).
 * @param env — env getter (defaults to `process.env.LLM_PROVIDER`).
 */
export function resolveActiveProviderForScope(
  channel: DispatchChannel,
  env: EnvGetter = defaultEnvGetter,
): ResolvedScope {
  // Audio bypasses LLM_PROVIDER — STT provider is fixed (OpenAI).
  if (channel === 'audio') {
    return { provider: 'openai', scope: 'third_party_ai_audio_openai' };
  }

  const raw = (env('LLM_PROVIDER') ?? 'openai').toLowerCase();
  // Only `openai` / `google` have a scope variant. `deepseek` and any other
  // value fall back to `openai` (parity with `env-resolvers.ts:121-124`).
  const provider: ConsentableProvider = raw === 'google' ? 'google' : 'openai';

  if (channel === 'text') {
    return {
      provider,
      scope: provider === 'google' ? 'third_party_ai_text_google' : 'third_party_ai_text_openai',
    };
  }
  // channel === 'image'
  return {
    provider,
    scope: provider === 'google' ? 'third_party_ai_image_google' : 'third_party_ai_image_openai',
  };
}
