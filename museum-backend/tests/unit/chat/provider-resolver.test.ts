/**
 * RED — UFR-022 phase=red, Cluster A (B6), RUN_ID=2026-05-21-p0-gdpr.
 *
 * Specifies `resolveActiveProviderForScope(channel)` (R8, D6) — the pure-TS
 * helper that maps a dispatch channel (`text` | `image` | `audio`) to:
 *   - `provider: 'openai' | 'google'` (resolved from env via injected getter)
 *   - `scope: ConsentScope` (the matching `third_party_ai_<channel>_<provider>`)
 *
 * Pre-impl the module path does not exist → dynamic import rejects → tests fail.
 *
 * Lib-docs consulted: lib-docs/typeorm/LESSONS.md (n/a — pure TS); the
 * provider terms (`openai`, `google`) are sourced from
 * `src/config/env-resolvers.ts:21` (LlmProvider z.enum).
 */

const MODULE_PATH = '@modules/chat/useCase/orchestration/provider-resolver';

interface ExpectedResolved {
  provider: 'openai' | 'google';
  scope: string;
}

type Channel = 'text' | 'image' | 'audio';
type EnvGetter = (name: 'LLM_PROVIDER') => string | undefined;

type ExpectedModuleShape = {
  resolveActiveProviderForScope: (channel: Channel, env?: EnvGetter) => ExpectedResolved;
};

async function loadModule(): Promise<ExpectedModuleShape> {
  const mod = (await import(MODULE_PATH)) as unknown as ExpectedModuleShape;
  return mod;
}

describe('resolveActiveProviderForScope — channel → provider → scope mapping (R8, D6)', () => {
  it('exports resolveActiveProviderForScope as a function', async () => {
    const mod = await loadModule();
    expect(typeof mod.resolveActiveProviderForScope).toBe('function');
  });

  it('defaults to OpenAI text dispatch — third_party_ai_text_openai', async () => {
    const { resolveActiveProviderForScope } = await loadModule();
    // No env override → default per design §9 D6: OpenAI for all channels.
    const result = resolveActiveProviderForScope('text', () => undefined);
    expect(result).toEqual({ provider: 'openai', scope: 'third_party_ai_text_openai' });
  });

  it('defaults to OpenAI image dispatch — third_party_ai_image_openai', async () => {
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('image', () => undefined);
    expect(result).toEqual({ provider: 'openai', scope: 'third_party_ai_image_openai' });
  });

  it('defaults to OpenAI audio dispatch — third_party_ai_audio_openai', async () => {
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('audio', () => undefined);
    expect(result).toEqual({ provider: 'openai', scope: 'third_party_ai_audio_openai' });
  });

  it('LLM_PROVIDER=google switches text scope to third_party_ai_text_google', async () => {
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('text', () => 'google');
    expect(result).toEqual({ provider: 'google', scope: 'third_party_ai_text_google' });
  });

  it('LLM_PROVIDER=google switches image scope to third_party_ai_image_google', async () => {
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('image', () => 'google');
    expect(result).toEqual({ provider: 'google', scope: 'third_party_ai_image_google' });
  });

  it('audio dispatch stays OpenAI even when LLM_PROVIDER=google (STT provider is fixed)', async () => {
    // chat-module.ts wires OpenAI STT regardless of the chat LLM provider —
    // the audio scope follows the STT provider (current = OpenAI). Documented
    // in design §3 R4 ("currently OpenAI") and §9 D6.
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('audio', () => 'google');
    expect(result.scope).toBe('third_party_ai_audio_openai');
    expect(result.provider).toBe('openai');
  });

  it('unknown LLM_PROVIDER value falls back to OpenAI (env-resolvers.ts:121-124 parity)', async () => {
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('text', () => 'mystery-llm');
    expect(result).toEqual({ provider: 'openai', scope: 'third_party_ai_text_openai' });
  });

  it('DeepSeek (Q3 out-of-scope) does not map to a third_party_ai_* scope — falls back to OpenAI', async () => {
    // Per spec §8 Q3 default: DeepSeek is on the recipients list but NOT
    // behind one of the 8 granular scopes yet. The resolver must not coin a
    // new scope variant — fallback keeps the gate safe.
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('text', () => 'deepseek');
    expect(result.scope).toMatch(/^third_party_ai_text_(openai|google)$/);
  });
});
