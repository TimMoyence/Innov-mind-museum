import { TTS_VOICES, isTtsVoice } from '@modules/chat/voice-catalog';

describe('TTS voice catalog (Spec C sentinel)', () => {
  it('exports exactly 6 voices in a canonical order', () => {
    expect([...TTS_VOICES]).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
  });

  it('isTtsVoice accepts known voices', () => {
    for (const v of TTS_VOICES) {
      expect(isTtsVoice(v)).toBe(true);
    }
  });

  it('isTtsVoice rejects unknown values', () => {
    expect(isTtsVoice('sage')).toBe(false);
    expect(isTtsVoice('')).toBe(false);
    expect(isTtsVoice(null)).toBe(false);
    expect(isTtsVoice(123)).toBe(false);
  });
});
