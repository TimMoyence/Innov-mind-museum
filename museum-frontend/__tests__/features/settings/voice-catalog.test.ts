import { TTS_VOICES } from '@/features/settings/voice-catalog';

describe('FE voice catalog parity (Spec C sentinel)', () => {
  it('matches the canonical 6-voice list', () => {
    expect([...TTS_VOICES]).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
  });
});
