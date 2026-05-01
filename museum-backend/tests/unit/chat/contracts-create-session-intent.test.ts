import { parseCreateSessionRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import { AppError } from '@shared/errors/app.error';

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

  it('rejects unknown intent value with a 400 BAD_REQUEST citing intent', () => {
    let caught: unknown;
    try {
      parseCreateSessionRequest({ intent: 'fly' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe('BAD_REQUEST');
    expect(appError.statusCode).toBe(400);
    expect(appError.message).toMatch(/intent/);
  });
});
