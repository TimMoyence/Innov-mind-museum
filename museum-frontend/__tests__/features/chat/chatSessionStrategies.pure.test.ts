import {
  hasContent,
  pickSendStrategy,
  type SendAttempt,
  type StrategyContext,
} from '@/features/chat/application/chatSessionStrategies.pure';

const baseContext = (override: Partial<StrategyContext> = {}): StrategyContext => ({
  isLowData: false,
  isOffline: false,
  isConnected: true,
  museumName: null,
  isFirstTurn: false,
  ...override,
});

describe('hasContent', () => {
  it('returns false for an empty attempt', () => {
    expect(hasContent({})).toBe(false);
  });

  it('returns false when text is only whitespace', () => {
    expect(hasContent({ text: '   ' })).toBe(false);
  });

  it('returns true for trimmed text', () => {
    expect(hasContent({ text: 'hello' })).toBe(true);
  });

  it('returns true for an image attachment', () => {
    expect(hasContent({ imageUri: 'file://a.jpg' })).toBe(true);
  });

  it('returns true for audio URI', () => {
    expect(hasContent({ audioUri: 'file://a.m4a' })).toBe(true);
  });

  it('returns true for an audio blob', () => {
    expect(hasContent({ audioBlob: new Blob(['x']) })).toBe(true);
  });
});

describe('pickSendStrategy', () => {
  it('returns null for empty content', () => {
    expect(pickSendStrategy({}, baseContext())).toBeNull();
    expect(pickSendStrategy({ text: '  ' }, baseContext())).toBeNull();
  });

  it("returns 'cache' for low-data + museum + first-turn + text-only", () => {
    const attempt: SendAttempt = { text: 'Hi' };
    const context = baseContext({ isLowData: true, museumName: 'Louvre', isFirstTurn: true });
    expect(pickSendStrategy(attempt, context)).toBe('cache');
  });

  it('ignores low-data path when an image is attached', () => {
    const attempt: SendAttempt = { text: 'Hi', imageUri: 'file://a.jpg' };
    const context = baseContext({ isLowData: true, museumName: 'Louvre', isFirstTurn: true });
    expect(pickSendStrategy(attempt, context)).toBe('streaming');
  });

  it('ignores low-data path when not first turn', () => {
    const attempt: SendAttempt = { text: 'Hi' };
    const context = baseContext({ isLowData: true, museumName: 'Louvre', isFirstTurn: false });
    expect(pickSendStrategy(attempt, context)).toBe('streaming');
  });

  it('ignores low-data path without a museum context', () => {
    const attempt: SendAttempt = { text: 'Hi' };
    const context = baseContext({ isLowData: true, museumName: null, isFirstTurn: true });
    expect(pickSendStrategy(attempt, context)).toBe('streaming');
  });

  it("returns 'offline' when the app flag is on (even with audio)", () => {
    const attempt: SendAttempt = { audioUri: 'file://a.m4a' };
    const context = baseContext({ isOffline: true });
    expect(pickSendStrategy(attempt, context)).toBe('offline');
  });

  it("returns 'audio' when an audioUri is attached and the app is online", () => {
    const attempt: SendAttempt = { audioUri: 'file://a.m4a' };
    expect(pickSendStrategy(attempt, baseContext())).toBe('audio');
  });

  it("returns 'audio' when an audioBlob is attached and the app is online", () => {
    const attempt: SendAttempt = { audioBlob: new Blob(['x']) };
    expect(pickSendStrategy(attempt, baseContext())).toBe('audio');
  });

  it("returns 'streaming' for text + image by default", () => {
    const attempt: SendAttempt = { text: 'Describe', imageUri: 'file://x.jpg' };
    expect(pickSendStrategy(attempt, baseContext())).toBe('streaming');
  });

  it("returns 'streaming' for text-only without cache eligibility", () => {
    const attempt: SendAttempt = { text: 'hey' };
    expect(pickSendStrategy(attempt, baseContext())).toBe('streaming');
  });
});
