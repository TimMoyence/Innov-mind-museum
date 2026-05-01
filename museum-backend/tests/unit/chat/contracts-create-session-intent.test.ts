import { parseCreateSessionRequest } from '@modules/chat/adapters/primary/http/chat.contracts';

describe('parseCreateSessionRequest intent', () => {
  it('accepts intent="walk"', () => {
    const result = parseCreateSessionRequest({ intent: 'walk' });
    expect(result.intent).toBe('walk');
  });

  it('accepts intent="default"', () => {
    const result = parseCreateSessionRequest({ intent: 'default' });
    expect(result.intent).toBe('default');
  });

  it('leaves intent undefined when omitted', () => {
    const result = parseCreateSessionRequest({});
    expect(result.intent).toBeUndefined();
  });

  it('rejects unknown intent value', () => {
    expect(() => parseCreateSessionRequest({ intent: 'fly' })).toThrow();
  });
});
