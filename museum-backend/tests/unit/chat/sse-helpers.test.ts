import {
  initSseResponse,
  sendSseEvent,
  sendSseToken,
  sendSseDone,
  sendSseError,
  sendSseGuardrail,
} from '@modules/chat/adapters/primary/http/helpers/sse.helpers';
import type { Response } from 'express';

const makeMockRes = (
  overrides: { writableEnded?: boolean; destroyed?: boolean } = {},
): Response & {
  write: jest.Mock;
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
} => {
  const res = {
    write: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    writableEnded: overrides.writableEnded ?? false,
    destroyed: overrides.destroyed ?? false,
  };
  return res as unknown as Response & {
    write: jest.Mock;
    setHeader: jest.Mock;
    flushHeaders: jest.Mock;
  };
};

describe('initSseResponse', () => {
  it('sets Content-Type, Cache-Control, Connection, X-Accel-Buffering headers and calls flushHeaders', () => {
    const res = makeMockRes();

    initSseResponse(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.flushHeaders).toHaveBeenCalledTimes(1);
  });
});

describe('sendSseToken', () => {
  it('writes correct SSE format: event: token\\ndata: {"t":"Hello"}\\n\\n', () => {
    const res = makeMockRes();

    sendSseToken(res, 'Hello');

    expect(res.write).toHaveBeenCalledWith('event: token\ndata: {"t":"Hello"}\n\n');
  });
});

describe('sendSseDone', () => {
  it('writes correct format with messageId, createdAt, metadata', () => {
    const res = makeMockRes();
    const payload = {
      messageId: 'msg-123',
      createdAt: '2026-03-19T10:00:00.000Z',
      metadata: { model: 'gpt-4', tokens: 42 },
    };

    sendSseDone(res, payload);

    expect(res.write).toHaveBeenCalledWith(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
  });
});

describe('sendSseError', () => {
  it('writes correct error event format', () => {
    const res = makeMockRes();

    sendSseError(res, 'RATE_LIMIT', 'Too many requests');

    expect(res.write).toHaveBeenCalledWith(
      'event: error\ndata: {"code":"RATE_LIMIT","message":"Too many requests"}\n\n',
    );
  });
});

describe('sendSseGuardrail', () => {
  it('writes correct guardrail event format', () => {
    const res = makeMockRes();

    sendSseGuardrail(res, 'Blocked content', 'insult');

    expect(res.write).toHaveBeenCalledWith(
      'event: guardrail\ndata: {"text":"Blocked content","reason":"insult"}\n\n',
    );
  });
});

describe('sendSseEvent', () => {
  it('does NOT write when res.writableEnded is true', () => {
    const res = makeMockRes({ writableEnded: true });

    sendSseEvent(res, 'token', { t: 'ignored' });

    expect(res.write).not.toHaveBeenCalled();
  });

  it('does NOT write when res.destroyed is true', () => {
    const res = makeMockRes({ destroyed: true });

    sendSseEvent(res, 'token', { t: 'ignored' });

    expect(res.write).not.toHaveBeenCalled();
  });

  it('handles object data by JSON.stringifying', () => {
    const res = makeMockRes();
    const data = { foo: 'bar', count: 7 };

    sendSseEvent(res, 'custom', data);

    expect(res.write).toHaveBeenCalledWith(`event: custom\ndata: ${JSON.stringify(data)}\n\n`);
  });

  it('writes string data as-is without JSON.stringifying', () => {
    const res = makeMockRes();

    sendSseEvent(res, 'ping', 'keep-alive');

    expect(res.write).toHaveBeenCalledWith('event: ping\ndata: keep-alive\n\n');
  });
});
