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
    const { resolveActiveProviderForScope } = await loadModule();
    const result = resolveActiveProviderForScope('text', () => 'deepseek');
    expect(result.scope).toMatch(/^third_party_ai_text_(openai|google)$/);
  });
});
