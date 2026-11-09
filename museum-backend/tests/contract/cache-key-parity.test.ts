import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';

import { makeCache, makeLlmCacheKeyInput } from '../helpers/chat/cache.fixtures';

import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

describe('cache-key parity contract (sentinel: cache-key-parity)', () => {
  let cache: ReturnType<typeof makeCache>;
  let service: LlmCacheServiceImpl;

  beforeEach(() => {
    cache = makeCache();
    service = new LlmCacheServiceImpl(cache);
  });

  it('R1 — store-key === lookup-key (read/write parity)', async () => {
    const input = makeLlmCacheKeyInput();

    await service.store(input, { text: 'v' });
    await service.lookup<{ text: string }>(input);

    const writtenKey = cache.set.mock.calls[0][0];
    const readKey = cache.get.mock.calls[0][0];

    expect(writtenKey).toBe(readKey);
  });

  it('R2 — computeKey === store-key === lookup-key (persistence-stamp parity)', async () => {
    const input = makeLlmCacheKeyInput();

    const stamped = service.computeKey(input);
    await service.store(input, { text: 'v' });
    await service.lookup<{ text: string }>(input);

    const writtenKey = cache.set.mock.calls[0][0];
    const readKey = cache.get.mock.calls[0][0];

    expect(stamped).toBe(writtenKey);
    expect(stamped).toBe(readKey);
  });

  it('R3 — key matches llm:v4:{ctx}:{museum|none}:{user|anon}:{32-lowercase-hex}', () => {
    const key = service.computeKey(makeLlmCacheKeyInput());

    expect(key).toMatch(
      /^llm:v4:(generic|museum-mode|personalized):(\d+|none):(\d+|anon):[0-9a-f]{32}$/,
    );
  });

  it('R4 — museumId segment precedes userId segment', () => {
    const key = service.computeKey(
      makeLlmCacheKeyInput({ museumContext: { museumId: 42, museumName: 'X' }, userId: 7 }),
    );

    const parts = key.split(':');
    expect(parts[3]).toBe('42');
    expect(parts[4]).toBe('7');
  });

  it('R10 — defaults: museumId→none, userId→anon', () => {
    const key = service.computeKey(makeLlmCacheKeyInput());

    const parts = key.split(':');
    expect(parts[3]).toBe('none');
    expect(parts[4]).toBe('anon');
  });

  it('R5 — invalidateMuseum prefix string-prefixes stored museum + personalized keys', async () => {
    const museumInput = makeLlmCacheKeyInput({
      museumContext: { museumId: 42, museumName: 'X' },
    });
    const persoInput = makeLlmCacheKeyInput({
      museumContext: { museumId: 42, museumName: 'X' },
      userPreferencesHash: 'h',
    });

    await service.store(museumInput, { text: 'm' });
    await service.store(persoInput, { text: 'p' });
    await service.invalidateMuseum(42);

    const museumKey = cache.set.mock.calls[0][0];
    const persoKey = cache.set.mock.calls[1][0];
    const prefixes = cache.delByPrefix.mock.calls.map((c) => c[0]);

    expect(prefixes.some((p) => museumKey.startsWith(p))).toBe(true);
    expect(prefixes.some((p) => persoKey.startsWith(p))).toBe(true);
  });

  it('R6 — key is independent of input field-insertion order', () => {
    const a = makeLlmCacheKeyInput({ userId: 7 });
    const b: LlmCacheKeyInput = {
      userId: 7,
      prompt: a.prompt,
      locale: a.locale,
      systemSection: a.systemSection,
      model: a.model,
    };

    expect(service.computeKey(a)).toBe(service.computeKey(b));
  });

  it('R7 — voiceMode:true differs from base; voiceMode:false folds to base', () => {
    const base = makeLlmCacheKeyInput();
    const keyBase = service.computeKey(base);

    expect(service.computeKey({ ...base, voiceMode: true })).not.toBe(keyBase);
    expect(service.computeKey({ ...base, voiceMode: false })).toBe(keyBase);
  });

  it('R8 — audioDescriptionMode:true differs from base; false folds to base', () => {
    const base = makeLlmCacheKeyInput();
    const keyBase = service.computeKey(base);

    expect(service.computeKey({ ...base, audioDescriptionMode: true })).not.toBe(keyBase);
    expect(service.computeKey({ ...base, audioDescriptionMode: false })).toBe(keyBase);
  });

  it('R9 — base === {voiceMode:false, audioDescriptionMode:false} (truthy-only backward-compat)', () => {
    const base = makeLlmCacheKeyInput();

    expect(service.computeKey(base)).toBe(
      service.computeKey({ ...base, voiceMode: false, audioDescriptionMode: false }),
    );
  });

  it('R11 — computeKey is deterministic and pure (no cache I/O)', () => {
    const input = makeLlmCacheKeyInput();

    const k1 = service.computeKey(input);
    const k2 = service.computeKey(input);

    expect(k1).toBe(k2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });
});
